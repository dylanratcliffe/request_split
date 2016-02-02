var http    = require('http');
var https   = require('https');
var request = require('request');
var fs      = require('fs');
var async   = require('async');
var path    = require('path');
var YAML    = require('yamljs');
var rest    = require('restler');
var config  = YAML.load('masters.yaml');
var webserver_certs = YAML.load('webserver_certs.yaml');



// TODO: See if I can refactor this to use one of the following libraries:
// https://github.com/request/request
// https://github.com/danwrong/Restler/
// https://github.com/tomas/needle


// Read the master certs into memory once
for (master in config) {
  config[master]['cert_file'] = fs.readFileSync(path.resolve(__dirname, config[master]['cert_file']))
  config[master]['key_file'] = fs.readFileSync(path.resolve(__dirname, config[master]['key_file']))
  config[master]['ca_cert'] = fs.readFileSync(path.resolve(__dirname, config[master]['ca_cert']))
}

// Read the webserver certs into memory
webserver_certs['cert_file'] = fs.readFileSync(path.resolve(__dirname, webserver_certs['cert_file']))
webserver_certs['key_file'] = fs.readFileSync(path.resolve(__dirname, webserver_certs['key_file']))
webserver_certs['ca_cert'] = fs.readFileSync(path.resolve(__dirname, webserver_certs['ca_cert']))


// Use the credentials form the first master in the config file
var default_master_config = config[(Object.keys(config)[0])]
var options = {
    cert: webserver_certs['cert_file'],
    key: webserver_certs['key_file'],
    ca: webserver_certs['ca_cert'],
    requestCert: false,
    rejectUnauthorized: false
};
// Okay so this block defines what the webserver will do. Inside is a request
// function that will basically do a request whenever the running webserver
// gets one. The plan is that it will just take the API request it gets and
// relay that to each server it is configured to.
var server = https.createServer(options, function(req, response) {
  // All of the code in this block is executed every time we get a request
  var errors = [];
  var master_responses = [];
  var body = '';

  // I have no idea why but doing this means that I can access the response
  // variable when I need to.
  // TODO: Understand this
  function getResponse() {
    return response
  }

  req.on('readable', function() {
    var tmp = req.read();
    if (tmp) {
      body += tmp;
    }
  })

  req.on('end', function() {
    async.forEachOf(config, function (master_config, master, callback) {
      console.log(("https://").concat(master).concat(":").concat(master_config['port']).concat(req.url))
      // This is the code that goes ahead and makes the second request to the
      // secondary Puppet Servers, there will be as many of these blocks as there
      // are slave Puppet masters.
      //
      // We are going to have to put a block in here that waits for all of the
      // requests to come back and then checks that they are all good.
      var forwarding_request = https.request({
        baseUrl: ("https://").concat(master).concat(":").concat(master_config['port']),
        url: req.url,
        method: req.method,
        headers: req.headers,
        timeout: 10000,
        followRedirect: true,
        maxRedirects: 10,
        agentOptions: {
          cert: master_config['cert_file'],
          key: master_config['key_file'],
          ca: master_config['ca_cert'],
        },
      }, function(error, master_response, body) {
        // In here is what gets executed after we have done the request. There will
        // need to be some error handling in here
        if (error) {
          errors.push(error)
        } else if (master_response) {
          master_responses.push(master_response)
        }
        callback()
      })
      forwarding_request.write(body);
      forwarding_request.end();
    }, function(err) {
      // Check if any of the masters failed to be contacted
      if (errors.length > 0) {
        console.error(errors)
      }

      // TODO: There is no point dealing with errors from GET requests as they
      // should just come from the MOM, however POST requests should go out and
      // errors should be handled. Make sure that if we have a GET request
      // that we just send back the MOM's response and that we only do error
      // handling when we have a POST

      if (req.method == "GET") {
        // Send back the response from the first server in the config file
        master_responses.forEach(function (value) {
          if (value.request.host == Object.keys(config)[0]) {
            response_to_send = value
          }
        })
      } else {
        var response_to_send;
        // Check if any masters responded, but did so with a bad code
        master_responses.forEach(function (value) {
          if (value.statusCode > 399) {
            response_to_send = value
          }
        })

        if (! response_to_send) {
          // Send back the response from the first server in the config file
          master_responses.forEach(function (value) {
            if (value.request.host == Object.keys(config)[0]) {
              response_to_send = value
            }
          })
        }
      }

      console.log("Sent back request from " + response_to_send.request.host);
      rebuildResponse(response, response_to_send, function(response) {
        response.end()
      })
      console.log("Done");

    });
  })
});

console.log("listening on port 44333")
server.listen(44333);

// This just grabs the fields from the response object we got from the puppet
// master and dumps it into a response object
function rebuildResponse(responseOut, responseIn, callback) {
  responseOut.statusCode = responseIn.statusCode
  responseOut.statusMessage = responseIn.statusMessage
  for (header in responseIn.headers) {
    responseOut.setHeader(header,responseIn.headers[header])
  }
  responseOut.write(responseIn.body)
  callback(responseOut)
}
