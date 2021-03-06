'use strict';

var nconf = require('nconf');
var fs = require("fs");

var client = require('./Client.js');

var config;

var EventHandlers = {
  // Common IRC events
  common: {
    /*
    "message#": function(from, to, message) {},
    "raw": function(message) { console.log(JSON.stringify(message)); },
    */

    /* @TODO: Do something better for whispers */
    "raw": function(message) {
      if (message.command != 'WHISPER') { return; }

      // message.rawCommand = 'PRIVMSG';
      message.command = 'PRIVMSG';
      message.args[0] = '#vsimbot';

      client.irc.emit('raw', message);
    },

    error: function(message) {
      console.error('ERROR: %s: %s'.error, message.command, message.args.join(' '));
    },

    connect: function() {
      console.log('*** connecting to %s... '.irc, config.server.bold);
    },

    disconnect: function() {
      console.log('*** disconnected'.irc);
    },

    join: function (channel, nick, message, callback) {
      if (nick !== config.userName) { return; }

      console.log('*** joined %s'.irc, channel.bold);
    },

    part: function (channel, nick, message, callback) {
      if (nick !== config.userName) { return; }

      console.log('*** parted %s'.irc, channel.bold);
    },
  },

  add: function(file, discord) {
    var self = this;
    var handlersDir = __dirname + '/handlers';
    var module = require(handlersDir + '/' + file);

    var handler = function() {
      var args, message, match;
      args = Array.prototype.slice.call(arguments, 0);
      args = discord ? args[0] : args;
      args.discord = discord;
      message = discord ? args.content : args[args.length-2];
      match = message.match(new RegExp(module.pattern, "i"));

      if (!match) { return; }
      if (typeof module.event === 'undefined') { return; }
      if (typeof module.pattern === 'undefined') { return; }
      if (typeof module.handler === 'undefined') { return; }

      if (typeof module.condition === 'function') {
        if (!module.condition(message)) { return; }
      }

      if (discord) {
        if (config.userName === args.author.username) { return; }
        
        module.handler.apply(this, [args.author.username, args.channel.name, message, args, match]);
      } else {
        args.push(match);
        module.handler.apply(this, args);
      }
    };

    if (discord) {
      client.discord.on('message', handler);
    } else {
      client.irc.addListener(module.event, handler);
    }
  },

  init: function() {
    var self = this;
    var handlersDir = __dirname + '/handlers';
    var events = Object.keys(self.common);

    config = nconf.get();

    for (var i=0; i<events.length; i++) {
      client.irc.addListener(events[i], self.common[events[i]]);
    }

    // @TODO: http://jsperf.com/chsspttrns
    fs.readdirSync(handlersDir).forEach(function(file) {
      self.add(file);
      self.add(file, true);
    });
  }
};



module.exports = EventHandlers;
