/* API */
var clientId = 'e65e3b88a703f084b6a438039763c998831e66e2f6a3bfdd3e1368ed70c125cf',
  clientSecret = '9a0873332333977db9374a93c7c7fd6b0f6bb4c2427d6bb5609c0e9b0b292615',
  redirectUrl = 'http://coinbase.hiveapp/index.html';

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
  expiresAt: now
}

function auth() {
  var token = localStorage.getItem('coinbase.token');

  if (token === null) {
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
      localStorage.setItem('coinbase.token', data.access_token);
      localStorage.setItem('coinbase.refresh_token', data.refresh_token);

      window.location = redirectUrl;
    }
  });
}

function refreshTokens() {
  var refresh_token;

  if (refresh_token = localStorage.getItem('coinbase.refresh_token')) {
    getTokens(refresh_token, 'refresh_token');
  }
}

function initPage() {
  if ($.cookies.test()) {
    currency = $.cookies.get('coinbase.currency');
  }

  if (currency === null) {
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

  if ($.cookies.test()) {
    $.cookies.set('coinbase.currency', currency, cookiesOptions);
  }

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
