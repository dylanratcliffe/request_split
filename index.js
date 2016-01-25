var http    = require('http');
var request = require("request");
var fs      = require('fs');
var path    = require('path');
var YAML    = require('yamljs');

var config = YAML.load('config.yaml');


// Okay so this block defines what the webserver will do. Inside is a request
// function that will basically do a request whenever the running webserver
// gets one. The plan is that it will just take the API request it gets and
// relay that to each server it is configured to.
var server = http.createServer(function(req, res) {
  // All of the code in this block is executed every time we get a request
  console.log("Got a request");

  for (var master in config) {
    console.log(master)
    // This is the code that goes ahead and makes the second request to the
    // secondary Puppet Servers, there will be as many of these blocks as there
    // are slave Puppet masters. (This will come form config eventually)
    //
    // We are going to have to put a block in here that waits for all of the
    // requests to come back and then checks that they are all good.
    request({
      baseUrl: "https://master.mel.puppetlabs.demo",
      url: req.url,
      method: req.method,
      timeout: 10000,
      followRedirect: true,
      maxRedirects: 10,
      agentOptions: {
        cert: fs.readFileSync(path.resolve(__dirname, config[master]['certFile'])),
        key: fs.readFileSync(path.resolve(__dirname, config[master]['keyFile'])),
        ca: fs.readFileSync(path.resolve(__dirname, config[master]['caCert'])),
      },
    }, function(error, response, body) {
      // In here is what gets executed after we have done the request. There will
      // need to be some error handling in here
      console.log(body);
    });
  }


  console.log("Done");
});

console.log("listening on port 5050")
server.listen(5050);
