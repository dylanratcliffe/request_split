var rest            = require('restler');
var https           = require('https');
var YAML            = require('yamljs');
var config          = YAML.load('masters.yaml');
var webserver_certs = YAML.load('webserver_certs.yaml');

// Read the master certs into memory
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

// Create the webserver
var server = https.createServer(options, function(req, response) {
  var body = '';
  var results = [];
  var master_responses = [];

  req.on('readable', function() {
    var tmp = req.read();
    if (tmp) {
      body += tmp;
    }
  })

  req.on('end', function() {
    async.forEachOf(config, function (master_config, master, callback) {
      // Do things in here asynchronously
      var full_url = ("https://").concat(master).concat(":").concat(master_config['port']).concat(req.url)
      rest.request(full_url,{
        method: req.method,
        data: body,
        headers: req.headers,
        agent: (new http.Agent({
          cert: master_config['cert_file'],
          key: master_config['key_file'],
          ca: master_config['ca_cert'],
        }))
      }).on('complete', function(result, response) {
        results.push(result)
        master_responses.push(response)
      })
    }, function(err) {
      // Do things in here once all of the above are done
      console.log("all done")
    }
  })
})
