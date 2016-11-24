var Hapi = require('hapi');
var Joi = require('joi');
var superagent = require('superagent-bluebird-promise');
var Promise = require('bluebird');
var moment = require('moment');
var server = new Hapi.Server();

// Server config.
server.connection({port: process.env.PORT || 8080});

// Helpers for timeout.
var TIMEOUT_DELAY = 1000 * 60; // Minutes
var timeout = null;

// Routing.
server.route({
  method: 'POST',
  path: '/',
  handler: function(request, reply) {
    // Allow only one timeout set. Poor mans throttling ;(
    if (timeout) {
      return reply('ignored').code(429);
    }

    // Set timeout.
    timeout = setTimeout(function() {
      // Logging.
      console.log('Executing');

      var iot_super_mode = request.payload && request.payload.iot_super_mode || false;
      var callback_url = request.payload && request.payload.callback_url || false;

      // Request data.
      var data = {
        flow_token: process.env.FLOWDOCK_FLOW_TOKEN,
        event: 'message',
        content: 'Fresh coffee in the kitchen!',
        thread_id: process.env.FLOWDOCK_THREAD_ID
      };

      // New promise for fetching gif.
      new Promise(function(resolve, reject) {
        // No gif keyword given, resolve promise.
        if (!process.env.GIF_KEYWORD) {
          resolve(false);
        }

        superagent
          .get('http://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=coffee&limit=0')
          .then(function(result) {
            var index = Math.floor(Math.random() * result.body.pagination.total_count);
            // Fetch gif and resolve with its URL.
            superagent
              // Using public beta key: https://github.com/Giphy/GiphyAPI#public-beta-key
              .get('http://api.giphy.com/v1/gifs/search?api_key=dc6zaTOxFJmzC&q=' + process.env.GIF_KEYWORD + '&limit=1&offset=' + index)
              .then(function(result) {
                resolve(result.body.data[0].images.downsized.url);
              });
          })
          .catch(function(err) {
            resolve(false);
          });
      })
      .then(function(image_url) {
        // If got gif, append to message content.
        if (image_url) {
          data.content += ' ' + image_url;
        }

        // Send request to given url.
        return superagent.post(process.env.FLOWDOCK_URL).send(data);
      })
      .then(function() {
        if (iot_super_mode && callback_url) {
          var week_start = moment().locale('fi').startOf('week').unix();
          var feed_api_url = "https://api.bt.tn/2014-06/8649/feed?filter=pressed&after=" + week_start;
          return superagent.get(feed_api_url)
            .then(function(response) {
              var count = response.body.events.length;

              return superagent.get(callback_url + count);
            });
        }

        return Promise.resolve({});
      })
      .catch(function(err) {
        console.log(err);
      })
      .finally(function() {
        timeout = null;
      });
    }, process.env.DELAY ? TIMEOUT_DELAY * process.env.DELAY : 100);

    return reply('success');
  }
});

// Start server.
server.start(function(err) {
  if (err) {
    throw err;
  }
});
