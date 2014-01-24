/* API */
var clientId = 'f40f30fb9d5e9cb7871bec9c14cacbc87bed46a093f7fb3d8bc00071b5f0dd60',
  clientSecret = '4e284b0c8445b654962167fa94049665c208ed49ce97fb2375fc9ed35e9ae447',
  redirectUrl = location.origin + location.pathname;

var apiHost = 'https://coinbase.com/',
  apiUrl = apiHost + 'api/v1/',
  token;

/* Layout elements */
var balance, exchange,
  history, historyRow,
  currency;

/* Cookies options */
var now = new Date();
now.setYear(now.getFullYear() + 2);

var cookiesOptions = {
  expiresAt: new Date(Date.now() + 365 * 86400 * 1000)
};

function auth() {
  var token = $.cookies.get('coinbase.token');

  if (!token) {
    var vars = parseQuery();

    if (vars.code === undefined) {
      window.location = apiHost + 'oauth/authorize?response_type=code'
        + '&client_id=' + clientId
        + '&redirect_uri=' + redirectUrl;
    }
    else {
      getTokens(vars.code);
    }

    return false;
  }
  else {
    return token;
  }
}

function getTokens(code, grantType) {
  var postFields;

  if (grantType === undefined) {
    grantType = 'authorization_code';
  }

  postFields = {
    redirect_uri  : redirectUrl,
    client_id     : clientId,
    client_secret : clientSecret,
    grant_type    : grantType
  };

  if (grantType === 'authorization_code') {
    postFields.code = code;
  }
  else if (grantType === 'refresh_token') {
    postFields.refresh_token = code;
  }

  $.ajax(apiHost + 'oauth/token', {
    data: postFields,
    type: 'POST',
    success: function(data) {
      $.cookies.set('coinbase.token', data.access_token, cookiesOptions);
      $.cookies.set('coinbase.refresh_token', data.refresh_token, cookiesOptions);

      window.location = redirectUrl;
    }
  });
}

function refreshTokens() {
  var refresh_token;

  if (refresh_token = $.cookies.get('coinbase.refresh_token')) {
    getTokens(refresh_token, 'refresh_token');
  }
}

function initPage() {
  currency = $.cookies.get('coinbase.currency');

  if (!currency) {
    setCurrency('EUR');
  }

  // Set interval for tokens refreshing
  window.setInterval(refreshTokens, 7000 * 1000);

  // Get elements
  balance = $('#current-balance .balance');
  exchange = $('#current-balance .exchange');

  // Subscripe exchange listener
  bitcoin.addExchangeRateListener(function(currency, amount) {
    var balance = $('.value', balance).data('balance');

    amount = amount * parseFloat(balance);

    exchange.animate({ opacity: 0 }, function() {
      exchange.find('.value').text(amount.toFixed(2));
      exchange.find('.currency').text(currency);

      exchange.animate({ opacity: 1 });
    });
  });

  // HISTORY
  history = $('#history');

  // Get history row placeholder
  historyRow = $('tbody tr', history).remove();

  // Refresh history
  refreshHistory();

  // Refresh balance
  refreshBalance();

  // Change qty
  $('#qty').on('blur', function() {
    var input = $(this),
      qty;

    qty = parseFloat(input.val());

    if (qty <= 0) {
      qty = 0.001;
    }

    input.val(qty);
  });

  // Change method
  $('.checkbox-action input').on('change', function() {
    var action = $(this),
      label;

    label = action.val();
    $('#do-transaction').text(label.charAt(0).toUpperCase() + label.slice(1));
  });

  // Change currency
  $('#change-currency').on('click', 'a', function() {
    var link = $(this);

    setCurrency(link.data('currency'));
  });

  // Do transaction
  $('#transaction').on('submit', function(e) {
    e.preventDefault();

    var form = $(this),
      loader = $('.loader', form);

    loader.stop().animate({ opacity: 1 });

    makeRequest('buys', 'post', { qty : parseFloat($('#qty').val()) }, function(data) {
      if (data.success) {
        showAlert('success', 'Transaction was successful');
        refreshBalance();
      }
      else {
        showAlert('danger', data.errors[0]);
      }

      loader.stop().animate({ opacity: 0 });
    });
  });

  $('#loading').fadeOut();
  $('#container').fadeIn();

  // Rescale elements when window is resizing
  $(window)
    .on('resize', onResize)
    .trigger('resize');
}

function makeRequest(uri, type, data, callback) {
  if (type == undefined) {
    type = 'get';
  }

  if (callback == undefined) {
    callback = data;
    data = null;
  }

  uri = apiUrl + uri + '?access_token=' + token;

  $.ajax(uri, {
    crossDomain : true,
    data        : data,
    dataType    : 'json',
    type        : type,
    success     : callback
  });
}

function onResize() {
  $('#container').css('min-height', $(window).height());
}

function parseQuery(query) {
  var vars = {},
    query = query || window.location.search,
    pairs = query.slice(query.indexOf('?') + 1).split('&');

  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i].split('=');
    vars[pair[0]] = pair[1];
  }

  return vars;
}

function refreshBalance() {
  makeRequest('account/balance', 'get', function(data) {
    var balanceAmount = parseFloat(data.amount);

    $('.value', balance)
      .text(balanceAmount.toFixed(3))
      .data('balance', balanceAmount);

    bitcoin.updateExchangeRate(currency);
  });
}

function refreshHistory() {
  makeRequest('transactions', 'get', function(data) {
    if (data.total_count > 0) {
      // Clear table
      $('tbody tr', history).remove();

      $.each(data.transactions, function(key, value) {
        var transaction = value.transaction,
          amount = parseFloat(transaction.amount.amount),
          row = historyRow.clone(),
          date;

        // Set transaction type
        if (amount > 0) {
          row
            .addClass('transaction-in')
            .find('.glyphicon').addClass('glyphicon-arrow-left');

          amount = '+' + amount.toFixed(4);
        }
        else {
          row
            .addClass('transaction-out')
            .find('.glyphicon').addClass('glyphicon-arrow-right');

          amount = amount.toFixed(4);
        }

        // Get date
        date = new Date(transaction.created_at);

        // Fill cells
        $('.name', row).append(transaction.id);
        $('.date', row).append([_date_pad(date.getDate()), _date_pad(date.getMonth() + 1), date.getFullYear()].join('.'));
        $('.amount', row).append(amount);

        // Add row to the table
        history.append(row);
      });
    }
  });
}

function setCurrency(newCurrency) {
  currency = newCurrency;

  $('.currency', exchange).text(currency);
  $.cookies.set('coinbase.currency', currency, cookiesOptions);

  bitcoin.updateExchangeRate(currency);
}

function showAlert(type, msg) {
  type = 'alert alert-' + type;

  $('#alert')
    .hide()
    .attr('class', type)
    .text(msg)
    .fadeIn();
}

function _date_pad(n) {
  return n.toString().length > 1 ? n : '0' + n;
}

jQuery(document).ready(function($) {
  if (token = auth()) {
    initPage();
  }
});
