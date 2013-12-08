var apiUrl = 'https://coinbase.com/api/v1/',
	token;

function getToken() {
	var token = localStorage.getItem('coinbase.token');

	if (token === null) {
		var clientId = 'e65e3b88a703f084b6a438039763c998831e66e2f6a3bfdd3e1368ed70c125cf',
			clientSecret = '9a0873332333977db9374a93c7c7fd6b0f6bb4c2427d6bb5609c0e9b0b292615',
			redirectUrl = 'http://coinbase.hiveapp/index.html',
			vars = parseQuery();

		if (vars.code === undefined) {
			window.location = 'https://coinbase.com/oauth/authorize?response_type=code'
				+ '&client_id=' + clientId
				+ '&redirect_uri=' + redirectUrl;
		}
		else {
			/**
			 * Because of security reasons (client_secret) token is returning
			 * by external service!
			 */
			$.ajax('https://coinbase.com/oauth/token', {
				data: {
					redirect_uri  : redirectUrl,
					client_id     : clientId,
					client_secret : clientSecret,
					grant_type    : 'authorization_code',
					code          : vars.code
				},
				type: 'POST',
				success: function(data) {
					localStorage.setItem('coinbase.token', data.access_token);
					window.location = redirectUrl;
				}
			});
		}

		return false;
	}
	else
	{
		return token;
	}
};

function initPage() {
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
		$('#current-balance .value').text(data.amount);
	});
}

function showAlert(type, msg) {
	type = 'alert alert-' + type;

	$('#alert')
		.hide()
		.attr('class', type)
		.text(msg)
		.fadeIn();
}

jQuery(document).ready(function($) {
	if (token = getToken()) {
		initPage();
	}
});