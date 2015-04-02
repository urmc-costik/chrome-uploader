/*
 * == BSD2 LICENSE ==
 * Copyright (c) 2014, Tidepool Project
 * 
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the associated License, which is identical to the BSD 2-Clause
 * License as published by the Open Source Initiative at opensource.org.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the License for more details.
 * 
 * You should have received a copy of the License along with this program; if
 * not, you can obtain one from Tidepool Project at tidepool.org.
 * == BSD2 LICENSE ==
 */

'use strict';

var _ = require('lodash');
var util = require('util');

var sundial = require('sundial');

var isBrowser = typeof window !== 'undefined';
var debug = isBrowser ? require('../bows')('TimezoneOffsetUtil') : console.log;

module.exports = function(timezone, mostRecent, changes) {
  var self = this;

  var offsetIntervals = [];
  var currentOffset = null, currentIndex = null;

  this.findOffsetDifference = function(event) {
    return Math.round(
      // some timezones have offsets in units of 15 minutes (e.g., +12:45)
      // so we round to the nearest 15 minutes whenever we see an offset change
      sundial.dateDifference(event.change.from, event.change.to, 'minutes')/15
    ) * 15;
  };

  function adjustCurrentOffset(event) {
    var difference = self.findOffsetDifference(event);
    // the farthest timezones are UTC+14 and UTC-12, so max offset
    // difference is 840 + 720 = 1560
    var MAX_DIFF = 1560;
    if (Math.abs(difference) <= MAX_DIFF) {
      currentOffset += Math.round(
        sundial.dateDifference(event.change.from, event.change.to, 'minutes')/60
      ) * 60;
    }
  }

  // check that an appropriate timezone is passed in
  try {
    sundial.checkTimezoneName(timezone);
  }
  catch (e) {
    throw e;
  }

  // check that an appropriate date of most recent datum is passed in
  if (isNaN(Date.parse(mostRecent))) {
    throw new Error('Invalid timestamp for most recent datum!');
  }

  // check that the changes are of the correct type if passed in
  if (!_.isEmpty(changes)) {
    _.each(changes, function(change) {
      if (!(change.subType && change.subType === 'timeChange')) {
        var error = new Error(util.format('Wrong subType of object passed as `timeChange`. Object is [%s]', JSON.stringify(change)));
        throw error;
      }
    });
    // now process the changes and set up the offset intervals
    var sorted = _.sortBy(changes, function(change) { return change.index; }).reverse();
    for (var i = 0; i < sorted.length; ++i) {
      var change = sorted[i];
      if (i === 0) {
        change.time = sundial.applyTimezone(change.jsDate, timezone).toISOString();
        change.timezoneOffset = sundial.getOffsetFromZone(change.time, timezone);
        delete change.jsDate;
        currentOffset = change.timezoneOffset;
        currentIndex = change.index;
        offsetIntervals.push({
          start: change.time,
          end: mostRecent,
          startIndex: null,
          endIndex: change.index,
          timezoneOffset: change.timezoneOffset
        });
        adjustCurrentOffset(change);
      }
      else {
        change.time = sundial.applyOffset(change.jsDate, -currentOffset).toISOString();
        change.timezoneOffset = currentOffset;
        delete change.jsDate;
        offsetIntervals.push({
          start: change.time,
          end: sorted[i - 1].time,
          startIndex: currentIndex,
          endIndex: change.index,
          timezoneOffset: currentOffset
        });
        adjustCurrentOffset(change);
        currentIndex = change.index;
      }
      changes[i] = change.done();
    }
    offsetIntervals.push({
      start: null,
      end: sorted[sorted.length - 1].time,
      startIndex: currentIndex,
      endIndex: null,
      timezoneOffset: currentOffset
    });
  }

  this.records = changes;
  debug('Date & time setting changes:');
  _.each(changes, function(change) {
    debug(change);
  });
  this.lookup = function(datetime, index) {
    var utc;
    if (!_.isEmpty(offsetIntervals)) {
      for (var i = 0; i < offsetIntervals.length; ++i) {
        var currentInterval = offsetIntervals[i];
        // reverse offset because we're going ~to~ UTC
        // we store offsets ~from~ UTC
        utc = sundial.applyOffset(datetime, -currentInterval.timezoneOffset).toISOString();
        var retObj = {
          time: utc,
          timezoneOffset: currentInterval.timezoneOffset
        };
        if (index !== null) {
          if (currentInterval.startIndex != null && currentInterval.endIndex != null) {
            if (index < currentInterval.startIndex && index > currentInterval.endIndex) {
              return retObj;
            }
          }
          else if (currentInterval.endIndex != null) {
            if (index > currentInterval.endIndex) {
              return retObj;
            }
          }
          else if (currentInterval.startIndex != null) {
            if (index < currentInterval.startIndex) {
              return retObj;
            }
          }
        }
        else {
          if (utc >= currentInterval.start && utc <= currentInterval.end) {
            return retObj;
          }
          else if (currentInterval.start === null && utc <= currentInterval.end) {
            return retObj;
          }
        }
      }
    }
    // default to across-the-board timezone application if no changes provided
    else {
      utc = sundial.applyTimezone(datetime, timezone).toISOString();
      return {
        time: utc,
        timezoneOffset: sundial.getOffsetFromZone(utc, timezone)
      };
    }    
  };

  this.fillInUTCInfo = function(obj, jsDate) {
    var res = this.lookup(jsDate, obj.index || null);
    if (!res) {
      console.log(obj);
      console.log(res);
    }
    obj.time = res.time;
    obj.timezoneOffset = res.timezoneOffset;
    return obj;
  }

  return this;
};