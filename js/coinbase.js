/* API */
var clientId = 'f40f30fb9d5e9cb7871bec9c14cacbc87bed46a093f7fb3d8bc00071b5f0dd60',
  clientSecret = '4e284b0c8445b654962167fa94049665c208ed49ce97fb2375fc9ed35e9ae447',
  redirectUrl = location.origin + location.pathname;

var apiHost = 'https://coinbase.com',
  apiUrl = apiHost + '/api/v1',
  token;

var minSentAmount = 10 * bitcoin.MBTC_IN_SATOSHI;

/* Layout elements */
var balance, exchange,
  history, historyRow,
  currency, userInfo, systemInfo, transactionCount;

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
      window.location = apiHost + '/oauth/authorize?response_type=code'
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

  bitcoin.makeRequest(apiHost + '/oauth/token', {
    data: postFields,
    dataType: 'json',
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
  loadHiveUserInfo();

  // Set interval for tokens refreshing
  window.setInterval(refreshTokens, 7000 * 1000);

  // Get elements
  balance = $('#current-balance .balance');
  exchange = $('#current-balance .exchange');

  // Subscribe exchange listener
  bitcoin.addExchangeRateListener(function(loadedCurrency, exchangeRate) {
    if (loadedCurrency != currency) {
      return;
    }

    var balanceAmount = $('.value', balance).data('balance');
    var amount = exchangeRate * parseFloat(balanceAmount);

    exchange.animate({ opacity: 0 }, function() {
      exchange.find('.value').text(amount.toFixed(2));
      exchange.find('.currency').text(loadedCurrency);

      exchange.animate({ opacity: 1 });
    });
  });

  // HISTORY
  history = $('#history');

  // Get history row placeholder
  historyRow = $('tbody tr', history).remove();

  // Refresh history
  window.setInterval(refreshHistory, 15 * 1000);
  refreshHistory();

  // Refresh balance
  refreshBalance();

  // Load receive address
  loadReceiveAddress();

  // Change method
  $('.nav-pills a').on('click', function() {
    var action = $(this);
    action.parent('li').addClass('active').siblings().removeClass('active');

    var label = action.attr('id');
    $('#transaction').find('section.' + label).show().siblings('section').hide();
  });

  // Change currency
  $('#change-currency').on('click', 'a', function() {
    var link = $(this);

    setCurrency(link.data('currency'));
  });

  // Selecting receive address
  $('#receive_address').on('mouseup', function(e) {
    $(this).select();
    e.preventDefault();
  });

  // Receive from Hive
  $('#send-from-hive').on('click', function(e) {
    bitcoin.sendMoney($('#receive_address').val());
    e.preventDefault();
  });

  // Copy Hive address
  $('#copy-hive-address').on('click', function(e) {
    $('#target_address').val(userInfo.address);
    e.preventDefault();
  });

  // Sending
  $('#send-from-coinbase').on('click', function(e) {
    e.preventDefault();

    var address = $('#target_address').val();
    if (!address) {
      showAlert('danger', "Enter a correct Bitcoin address.");
      return;
    }

    var amountText = $('#qty').val();
    var amount = bitcoin.satoshiFromUserString(amountText);

    if (!amountText || !amount) {
      showAlert('danger', "Enter a correct amount.");
      return;
    }

    if (amount < minSentAmount) {
      showAlert('danger', "Minimum transaction amount is " + bitcoin.userStringForSatoshi(minSentAmount) +
        ' ' + systemInfo.preferredBitcoinFormat + '.');
      return;
    }

    if (amount > $('.value', balance).data('balance') * bitcoin.BTC_IN_SATOSHI) {
      showAlert('danger', "This is more than you have in your Coinbase wallet.");
      return;
    }

    var result = confirm('Are you sure you want to send ' + amountText + ' ' + systemInfo.preferredBitcoinFormat +
       ' to ' + address + '?');

    if (!result) {
      return;
    }

    var form = $(this),
      loader = $('.loader', form);

    loader.stop().animate({ opacity: 1 });

    var sentData = {
      'transaction[to]': address,
      'transaction[amount]': '' + (amount / bitcoin.BTC_IN_SATOSHI)
    };

    makeRequest('/transactions/send_money', 'post', sentData, function(data) {
      if (data.success) {
        showAlert('success', 'Transaction was successful');
        refreshBalance();
        refreshHistory();
      } else {
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

  bitcoin.makeRequest(uri, {
    data: data,
    dataType: 'json',
    type: type,
    success: callback,
    error: function(response, status, error) {
      console.log('Connection error: ', response, status, error);

      if (status == 401) {
        $.cookies.del('coinbase.token');

        if (refresh_token = $.cookies.get('coinbase.refresh_token')) {
          getTokens(refresh_token, 'refresh_token');
        } else {
          auth();
        }
      }
    }
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
  makeRequest('/account/balance', 'get', function(data) {
    var balanceAmount = parseFloat(data.amount);

    $('.value', balance)
      .html(formatBitcoinAmount(balanceAmount))
      .data('balance', balanceAmount);

    bitcoin.updateExchangeRate(currency);
  });
}

function formatBitcoinAmount(amount) {
  return bitcoin.userStringForSatoshi(amount * bitcoin.BTC_IN_SATOSHI) + '&nbsp;' + systemInfo.preferredBitcoinFormat;
}

function loadReceiveAddress() {
  makeRequest('/account/receive_address', 'get', function(data) {
    $('#receive_address').val(data.address);
  });
}

function loadHiveUserInfo() {
  bitcoin.getUserInfo(function(data) {
    userInfo = data;
  });

  bitcoin.getSystemInfo(function(data) {
    systemInfo = data;
    currency = systemInfo.preferredCurrency;
    $('.form-group-qty label').text(systemInfo.preferredBitcoinFormat);
    $('#qty').val(bitcoin.userStringForSatoshi(minSentAmount));
  });
}

function refreshHistory() {
  makeRequest('/transactions', 'get', function(data) {
    if (data.total_count > 0) {
      // Clear table
      $('tbody tr', history).remove();

      if (transactionCount && transactionCount != data.total_count) {
        refreshBalance();
      }

      transactionCount = data.total_count;

      $.each(data.transactions, function(key, value) {
        var transaction = value.transaction,
          amount = parseFloat(transaction.amount.amount),
          amountText,
          row = historyRow.clone(),
          date;

        // Set transaction type
        if (amount > 0) {
          row
            .addClass('transaction-in')
            .find('.glyphicon').addClass('glyphicon-arrow-left');

          amountText = '+' + formatBitcoinAmount(amount);
        }
        else {
          row
            .addClass('transaction-out')
            .find('.glyphicon').addClass('glyphicon-arrow-right');

          amountText = '-' + formatBitcoinAmount(-amount);
        }

        // Get date
        date = new Date(transaction.created_at);

        // Fill cells
        if (amount > 0) {
          $('.name', row).append(transaction.sender ? transaction.sender.email : 'External account');
        } else {
          $('.name', row).append(transaction.recipient ? transaction.recipient.email :
            transaction.recipient_address ? transaction.recipient_address : 'External account');
        }

        $('.date', row).append([_date_pad(date.getDate()), _date_pad(date.getMonth() + 1), date.getFullYear()].join('.'));
        $('.amount', row).append(amountText);

        // Add row to the table
        history.append(row);
      });
    }
  });
}

function setCurrency(newCurrency) {
  currency = newCurrency;

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
