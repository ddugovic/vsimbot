'use strict';

var Utils = require('./../Utils.js');

// post FEN to lichess.org
var addFEN = function(from, to, message, raw, match) {

  var fen = match[0];
  var url = 'http://lichess.org/editor/' + fen;
  var text = 'The FEN posted by ' + from + ' is now available at: ' + url;
  console.say(to, text);
};

module.exports.event = 'message#';
module.exports.pattern = Utils.fenRE;
module.exports.handler = addFEN;
module.exports.condition = function(message) {
  return !message.match(/(eval|evaluate|analyze|score)\s/);
};
