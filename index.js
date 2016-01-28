var http    = require('http');
var request = require('request');
var fs      = require('fs');
var async   = require('async');
var path    = require('path');
var YAML    = require('yamljs');
var config = YAML.load('config.yaml');

// Okay so this block defines what the webserver will do. Inside is a request
// function that will basically do a request whenever the running webserver
// gets one. The plan is that it will just take the API request it gets and
// relay that to each server it is configured to.
var server = http.createServer(function(req, response) {
  // All of the code in this block is executed every time we get a request
  console.log("Got a request");
  var errors = [];
  var master_responses = [];

  // I have no idea why but doing this means that I can access the response
  // variable when I need to.
  // TODO: Understand this
  function getResponse() {
    return response
  }

  async.forEachOf(config, function (master_config, master, callback) {
    console.log(("https://").concat(master).concat(":").concat(master_config['port']).concat(req.url))
    // This is the code that goes ahead and makes the second request to the
    // secondary Puppet Servers, there will be as many of these blocks as there
    // are slave Puppet masters.
    //
    // We are going to have to put a block in here that waits for all of the
    // requests to come back and then checks that they are all good.
    request({
      baseUrl: ("https://").concat(master).concat(":").concat(master_config['port']),
      url: req.url,
      method: req.method,
      timeout: 10000,
      followRedirect: true,
      maxRedirects: 10,
      agentOptions: {
        cert: fs.readFileSync(path.resolve(__dirname, master_config['certFile'])),
        key: fs.readFileSync(path.resolve(__dirname, master_config['keyFile'])),
        ca: fs.readFileSync(path.resolve(__dirname, master_config['caCert'])),
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
  }, function(err) {
    // Check if any of the masters failed to be contacted
    if (errors.length > 0) {
      console.error(errors)
    }

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

    rebuildResponse(response, response_to_send, function(response) {
      response.end()
    })
    console.log("Done");

  });
});

console.log("listening on port 5050")
server.listen(5050);

function rebuildResponse(responseOut, responseIn, callback) {
  responseOut.statusCode = responseIn.statusCode
  responseOut.statusMessage = responseIn.statusMessage
  for (header in responseIn.headers) {
    responseOut.setHeader(header,responseIn.headers[header])
  }
  responseOut.write(responseIn.body)
  callback(responseOut)
}
