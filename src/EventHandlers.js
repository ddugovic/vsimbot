'use strict';

var nconf = require('nconf');
var util = require('util');
var spawn = require('child_process').spawn;

var icc = require('./ICC.js');
var fide = require('./FIDE.js');
var cpb = require('./ChessPasteBin.js');

var bot, config;

// @TODO: This is a very simplistic pgn regexp. No support for variations or comments
var pgnRENumber = "\\d+\\.\\s*";
var pgnREPly = "[\\w\\+\\-#=]{2,8}\\s*";
var pgnREOnePly = "(" + pgnRENumber + pgnREPly + ")";
var pgnRETwoPlys = "(" + pgnRENumber + pgnREPly + pgnREPly + "\\s*)";
var pgnREHeader = "(\\[([^\\]]+)\\]\\s*)*";
var pgnREResult = "(\\*|1\\-0|0\\-1|0\\.5\\-0\\.5|\\.5\\-\\.5|1\\/2\\-1\\/2)?";
var pgnRE = "(" +
  pgnREHeader +
  pgnRETwoPlys + "{2,}\\s*" +
  pgnREOnePly + "?" +
  pgnREResult +
  ")";

// Thanks to http://chess.stackexchange.com/questions/1482/how-to-know-when-a-fen-position-is-legal
// Halfmove clock and fullmove number are optional
var fenREPiecePlacement = "([rnbqkpRNBQKP1-8]+\\/){7}([rnbqkpRNBQKP1-8]+)";
var fenREActiveColor = "[bw-]";
var fenRECastlingAvailability = "(([a-hkqA-HKQ]{1,4})|(-))";
var fenREEnPassantTarget = "(([a-h][36])|(-))";
var fenREHalfMoveClock = "\\d*";
var fenREFullMoveNumber = "\\d*";
var fenRE = "" +
  fenREPiecePlacement + "\\s" +
  fenREActiveColor + "\\s" +
  fenRECastlingAvailability + "\\s" +
  fenREEnPassantTarget + "\\s?" +
  fenREHalfMoveClock + "\\s?" +
  fenREFullMoveNumber;

var evalfenRE = "(eval|evaluate|analyze|score)\\s(" + fenRE + ")";

var patterns = {};

// finger icc
patterns["^(finger|fi|who\\sis|who\\'s)\\s(.*)"] = function(from, to, message, raw, match) {
  var handle;

  handle = match[2];
  handle = handle.replace(/[^\w\s-]/gi, ''); // ICC handles must be alphanumeric

  console.message('/icc.finger %s'.input, to, from, handle);
  
  var printFinger = function(handle, exists, iccInfo, fideInfo, twitchName) {
    if (!iccInfo)  { iccInfo  = {}; }
    if (!fideInfo) { fideInfo = {}; }

    var text = '"' + handle + '"';
    var titleAndName = '';
    var rating, title, url;

    // Use the FIDE title instead of ICC if possible
    // ICC profiles can take longer to get updated
    if (iccInfo.title)      { title = iccInfo.title; }
    if (fideInfo.titleAbbr) { title = fideInfo.titleAbbr; }

    if (fideInfo.ratings && fideInfo.ratings.std) { rating = fideInfo.ratings.std; }

    titleAndName = (title ? title + ' ' : '') + (iccInfo.name ? iccInfo.name : '');

    switch (exists) {
      case 'public':    text += ' is ' + titleAndName; break;
      case 'known':     text += ' is ' + titleAndName; break;
      case 'suspected': text += ' is allegedly ' + titleAndName; break;
      case 'notpublic': text = 'No public info for "' + handle + '"'; break;
      default: text = '';
    }

    if (rating) { text += ' (FIDE ' + rating + ')'; }
    if (fideInfo.url) { text += ' ' + fideInfo.url; }
    if (twitchName) { text += '. Follow him at http://twitch.tv/' + twitchName; }

    notifyChannelAndLogMessage(to, text);
  };

  icc.finger(handle, function(exists, iccInfo, twitchName) {
    // Not displaying anything if the account doesn't exist
    if (!exists) { return; }

    fide.getProfileUrl(iccInfo.name, function(fideProfileUrl) {
      fide.getPlayerInfo(fideProfileUrl, function(fideInfo) {
        printFinger(handle, exists, iccInfo, fideInfo, twitchName);
      });
    });
  });
};

// post pgn to chesspastebin
patterns[pgnRE] = function(from, to, message, raw, match) {
  // additional verification to make sure the first 2 moves are present
  // to prevent messages like "http://chess-db.com/public/game.jsp?id=14101513.4202848.139710976" to match "14101513.4202848.139710976"
  if (match &&
      match[0] &&
      match[0].indexOf('1.') < 0 &&
      match[0].indexOf('2.') < 0) {
    return;
  }
  
  addToChessPasteBin(from, to, message, raw, match);
};

// evaluate position from fen
// @TODO: This is a mess
// @TODO: Show recommended move?
// @TODO: Add timeout with crafty.kill()?
patterns[evalfenRE] = function(from, to, message, raw, match) {
  var crafty = spawn('crafty');
  var dataCache = [];
  var fen = match[2];
  var text = '';

  console.message('/eval %s'.input, to, from, fen);

  crafty.stderr.on('data', function (data) {
    // console.log('stderr: ' + data);
  });

  crafty.stdout.on('data', function (data) {
    dataCache.push(data);
  });

  crafty.on('exit', function (code) {
    var i = dataCache.length;

    var line, match;

    var depth, mates, mated;
    var values, time, score;

    while (i--) {
      line = dataCache[i] + '';
      match = line.match(/^(\d+)\->|(mated?\sin\s\d+\smoves?)|((\d\-\d)\s\{(White|Black)\smates\})/i);

      if (match) { break; }
    }

    if (!match) { return; }

    depth = match[1];
    mates = match[2];
    mated = match[3];

    values = line.match(/\S+/ig);
    time  = values[1];
    score = values[2];

    if (depth) { text += score + ' (time=' + time + 's, depth=' + depth + ')'; }
    if (mates) { text += mates; } // @TODO: Specify which color mates or gets mated
    if (mated) { text += mated; }

    notifyChannelAndLogMessage(to, text);
  });

  // @TODO: Moves these options to a config file?
  crafty.stdin.write('log off\n');
  crafty.stdin.write('ponder off\n');
  crafty.stdin.write('st 30\n');
  // crafty.stdin.write('sd 18\n');
  // crafty.stdin.write('book off\n');

  crafty.stdin.write('setboard ' + fen + '\n');

  // crafty.stdin.write('score\n');
  crafty.stdin.write('go\n');
  crafty.stdin.write('quit\n');
};

// post fen to chesspastebin
patterns[fenRE] = function(from, to, message, raw, match) {
  addToChessPasteBin(from, to, message, raw, match, true);
};




var addToChessPasteBin = function(from, to, message, raw, match, isFEN) {
  var pgn = match[0];
  var format = isFEN ? 'FEN' : 'PGN';
  var fnName = 'add' + format;

  console.message('/chesspastebin.%s %s'.input, to, from, fnName, pgn);

  cpb[fnName](config.chesspastebinAPIKey, pgn, from, undefined, config.chesspastebinSandbox, function(data) {
    var cpbUrl = 'http://www.chesspastebin.com/?p=';
    var cpbId = data;
    var text = '';

    // @TODO: Log error if no id is returned by chesspastebin?
    if (!isNaN(cpb)) { return; }

    text = 'The ' + format + ' posted by ' + from + ' is now available at: ' + cpbUrl + cpbId;

    notifyChannelAndLogMessage(to, text);
  });
};

var notifyChannelAndLogMessage = function(to, text) {
  bot.say(to, text);
  console.message('%s', to, config.userName, text);
};



var EventHandlers = {
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

  // @TODO: Use config.userName?
  "message#vsimbot": function(from, message) {
    var to = '#vsimbot';
    var match = message.match(/^(join|part)\s?(#?(\w*))?/i);
    var action, channel;
    var channels = config.channels;

    if (match) {
      action = match[1];
      channel = '#' + from;

      // @TODO: Allow users to specify which channel to join?
      // channel = match[3].length ? '#' + match[3] : channel;

      console.message('/%s %s'.input, to, from, action, channel);

      // Save channels in config
      if (action === 'join') {
        if (channels.indexOf(channel) < 0) {
          channels.push(channel);
        }
      }

      if (action === 'part') {
        channels = channels.filter(function(value) {
          return value !== channel;
        });
      }

      nconf.set('channels', channels);
      nconf.save(function(err) {
        if (err) { return console.error(err); }
      });

      bot[action](channel);
      notifyChannelAndLogMessage(to, action + 'ing ' + channel);
    }
  },

  "message#": function(from, to, message) {
    var match;
    var args = Array.prototype.slice.call(arguments, 0);

    // @TODO: This is very slow.
    for (var pattern in patterns) {
      if (patterns.hasOwnProperty(pattern)) {
        match = message.match(new RegExp(pattern, "i"));

        if (match) {
          args.push(match);
          patterns[pattern].apply(this, args);
          return;
        }
      }
    }
  },

  /*
  "raw": function(message) {
    console.log(JSON.stringify(message));
  },
  */

  init: function(ircClient, botConfig) {
    var events = Object.keys(EventHandlers);
    
    bot = ircClient;
    config = botConfig;

    for (var i=0; i<events.length-1; i++) {
      ircClient.addListener(events[i], EventHandlers[events[i]]);
    }
  }
};



module.exports = EventHandlers;
