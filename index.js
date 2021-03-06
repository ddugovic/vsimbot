#!/usr/bin/env node

'use strict';

// @TODO: Log network connection loss

var nconf = require('nconf');
var colors = require('colors');

var client = require('./src/Client.js');
var cli = require('./src/CLI.js');
var handlers = require('./src/EventHandlers.js');

var config = nconf
  .argv()
  .env()
  .file({ file: 'config.json' })
  .get();

var loadTheme = function(name) {
  if (typeof name === 'undefined') { name = 'default'; }
  
  var THEME_PATH = __dirname + '/src/themes/';
  colors.setTheme(THEME_PATH + name + '.js');
};

var init = function() {
  loadTheme(config.theme);

  cli.init();
  handlers.init();

  // IRC client
  client.irc.connect(function() {
    console.log('*** connected to IRC server.'.info);
    client.irc.send('quote CAP REQ :twitch.tv/membership');
    client.irc.send('quote CAP REQ :twitch.tv/commands');
  });

  // Discord client
  client.discord.on('ready', function() {
    console.log('*** connected to Discord server.'.info);
  });
  client.discord.login(config.discordToken);
};



init();
