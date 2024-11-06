"use strict";

const WebSocketServer = require('ws').Server;
const Splitter        = require('stream-split');
const util            = require('util');
const spawn           = require('child_process').spawn;
const merge           = require('mout/object/merge');

const NALseparator    = Buffer.from([0,0,0,1]);//NAL break

class _Server {
  constructor(server, options) {
    this.options = merge({
        width : 640,
        height: 360,
        fps : 30,
    }, options);

    this.wss = new WebSocketServer({ server });

    this.new_client = this.new_client.bind(this);
    this.start_feed = this.start_feed.bind(this);
    this.broadcast  = this.broadcast.bind(this);
    this.streamer = null;
    this.wss.on('connection', this.new_client);
  }
  
  start_feed() {
    var readStream = this.get_feed();
    this.readStream = readStream;

    readStream = readStream.pipe(new Splitter(NALseparator));
    readStream.on("data", this.broadcast);
  }

  get_feed() {
    this.streamer = spawn('raspivid', ['-t', '0', '-o', '-', '-w', this.options.width, '-h', this.options.height, '-fps', this.options.fps, '-pf', 'baseline']);
    this.streamer.on("exit", function(code){
      if (code){
        console.log("Failure", code);
      }
    });
    return this.streamer.stdout;
  }

  broadcast(data) {
    this.wss.clients.forEach(function(socket) {

      if(socket.buzy)
        return;

      socket.buzy = true;
      socket.buzy = false;

      socket.send(Buffer.concat([NALseparator, data]), { binary: true}, function ack(error) {
        socket.buzy = false;
      });
    });
  }

  new_client(socket) {
  
    var self = this;
    console.log('Client connected');

    socket.send(JSON.stringify({
      action : "init",
      width  : this.options.width,
      height : this.options.height,
    }));

    socket.on("message", function(data){
      var cmd = "" + data, action = data.split(' ')[0];
      console.log("Incomming action '%s'", action);

      if(action == "REQUESTSTREAM"){
        if (self.readStream){
            self.streamer.kill()
        }
        self.start_feed();
      }
      if(action == "STOPSTREAM")
        self.readStream.pause();
    });

    socket.on('close', function() {
      // self.readStream.pause();
      console.log('stopping client interval');
    });
  }


};


module.exports = _Server;