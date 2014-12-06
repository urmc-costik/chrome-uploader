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

var _ = require('lodash');
var proxyquire = require('proxyquire').noCallThru();
var expect = require('salinity').expect;
var appState = require('../../lib/state/appState');

describe('appActions', function() {
  // Mock all I/O
  var config, now, sundial, localStore, api, jellyfish, device, carelink;
  var app;
  var appActions;
  beforeEach(function() {
    config = {};
    now = '2014-01-31T22:00:00-05:00';
    sundial = {
      utcDateString: function() { return now; }
    };
    localStore = {};
    api = {};
    jellyfish = {};
    device = {};
    carelink = {};

    app = {
      state: {},
      setState: function(updates) {
        this.state = _.assign(this.state, updates);
      }
    };
    appState.bindApp(app);

    appActions = proxyquire('../../lib/state/appActions', {
      '../config': config,
      'sundial': sundial,
      '../core/localStore': localStore,
      '../core/api': api,
      '../jellyfishClient': function() { return jellyfish; },
      '../core/device': device,
      '../core/carelink': carelink
    });
    appActions.bindApp(app);
  });

  it('binds to app component', function() {
    app.state.FOO = 'bar';
    expect(appActions.app.state.FOO).to.equal('bar');
  });

  describe('load', function() {
    beforeEach(function() {
      localStore.getInitialState = function() {};
      localStore.init = function(options, cb) { cb(); };
      api.init = function(options, cb) { cb(); };
      device.init = function(options, cb) { cb(); };
      carelink.init = function(options, cb) { cb(); };

      api.user = {};
      api.user.account = function(cb) { cb(); };
      api.user.profile = function(cb) { cb(); };
    });

    it('initializes all I/O services', function(done) {
      localStore.getInitialState = function() {};
      var initialized = {};
      var mark = function(name, cb) {
        initialized[name] = true;
        cb();
      };
      localStore.init = function(options, cb) { mark('localStore', cb); };
      api.init = function(options, cb) { mark('api', cb); };
      device.init = function(options, cb) { mark('device', cb); };
      carelink.init = function(options, cb) { mark('carelink', cb); };

      appActions.load(function(err) {
        if (err) throw err;
        expect(initialized.localStore).to.be.true;
        expect(initialized.api).to.be.true;
        expect(initialized.device).to.be.true;
        expect(initialized.carelink).to.be.true;
        done();
      });
    });

    it('goes to login page if no session found', function(done) {
      api.init = function(options, cb) { cb(); };

      appActions.load(function(err) {
        if (err) throw err;
        expect(app.state.page).to.equal('login');
        done();
      });
    });

    it('goes to main page if local session found', function(done) {
      api.init = function(options, cb) { cb(null, {token: '1234'}); };

      appActions.load(function(err) {
        if (err) throw err;
        expect(app.state.page).to.equal('main');
        done();
      });
    });

    it('loads logged-in user if local session found', function(done) {
      api.init = function(options, cb) { cb(null, {token: '1234'}); };
      api.user.account = function(cb) { cb(null, {userid: '11'}); };
      api.user.profile = function(cb) { cb(null, {fullName: 'bob'}); };

      appActions.load(function(err) {
        if (err) throw err;
        expect(app.state.user).to.deep.equal({
          userid: '11',
          profile: {fullName: 'bob'}
        });
        done();
      });
    });

    it('sets target user id as logged-in user id', function(done) {
      api.init = function(options, cb) { cb(null, {token: '1234'}); };
      api.user.account = function(cb) { cb(null, {userid: '11'}); };

      appActions.load(function(err) {
        if (err) throw err;
        expect(app.state.targetId).to.equal('11');
        done();
      });
    });

  });

  describe('login', function() {
    beforeEach(function() {
      api.user = {};
      api.user.login = function(credentials, options, cb) { cb(); };
      api.user.profile = function(cb) { cb(); };
    });

    it('goes to main page if login successful', function(done) {
      appActions.login({}, {}, function(err) {
        if (err) throw err;
        expect(app.state.page).to.equal('main');
        done();
      });
    });

    it('loads logged-in user if login successful', function(done) {
      api.user.login = function(credentials, options, cb) {
        cb(null, {user: {userid: '11'}});
      };
      api.user.profile = function(cb) { cb(null, {fullName: 'bob'}); };

      appActions.login({}, {}, function(err) {
        if (err) throw err;
        expect(app.state.user).to.deep.equal({
          userid: '11',
          profile: {fullName: 'bob'}
        });
        done();
      });
    });

    it('calls callback with error if login failed', function(done) {
      api.user.login = function(credentials, options, cb) {
        cb({status: 401});
      };

      appActions.login({}, {}, function(err) {
        if (err && err.status !== 401) throw err;
        expect(err.status).to.equal(401);
        done();
      });
    });

    it('sets target user id as logged-in user id', function(done) {
      api.user.login = function(credentials, options, cb) {
        cb(null, {user: {userid: '11'}});
      };

      appActions.login({}, {}, function(err) {
        if (err) throw err;
        expect(app.state.targetId).to.equal('11');
        done();
      });
    });

  });

  describe('logout', function() {
    beforeEach(function() {
      api.user = {};
      api.user.logout = function(cb) { cb(); };
    });

    it('resets app state', function(done) {
      app.state = {
        user: {userid: '11'},
        targetId: '11',
        uploads: [1, 2, 3]
      };
      appActions.logout(function(err) {
        if (err) throw err;
        expect(app.state.user).to.not.exist;
        expect(app.state.targetId).to.not.exist;
        expect(app.state.uploads).to.be.empty;
        done();
      });
    });

    it('goes back to login page', function(done) {
      app.state.page = 'main';
      appActions.logout(function(err) {
        if (err) throw err;
        expect(app.state.page).to.equal('login');
        done();
      });
    });

  });

  describe('detectDevices', function() {
    var connectedDevices;
    beforeEach(function() {
      connectedDevices = [];
      device.detectAll = function(cb) {
        return cb(null, connectedDevices);
      };
    });

    it('adds a new device upload', function(done) {
      app.state.uploads = [];
      connectedDevices = [{
        driverId: 'DexcomG4',
        usb: 3
      }];

      appActions.detectDevices(function(err) {
        if (err) throw err;
        expect(app.state.uploads).to.have.length(1);
        expect(app.state.uploads[0].source).to.deep.equal({
          type: 'device',
          driverId: 'DexcomG4',
          usb: 3,
          connected: true
        });
        done();
      });
    });

    it('keeps carelink at the end when adding new device', function(done) {
      app.state.uploads = [
        {source: {type: 'carelink'}}
      ];
      connectedDevices = [{
        driverId: 'DexcomG4',
        usb: 3
      }];

      appActions.detectDevices(function(err) {
        if (err) throw err;
        expect(app.state.uploads).to.have.length(2);
        expect(app.state.uploads[1].source.type).to.equal('carelink');
        done();
      });
    });

    it('marks device upload as disconnected', function(done) {
      app.state.uploads = [
        {
          source: {
            type: 'device',
            driverId: 'DexcomG4',
            usb: 3,
            connected: true
          }
        }
      ];
      connectedDevices = [];

      appActions.detectDevices(function(err) {
        if (err) throw err;
        expect(app.state.uploads).to.have.length(1);
        expect(app.state.uploads[0].source.connected).to.be.false;
        done();
      });
    });

    it('marks device upload as connected', function(done) {
      app.state.uploads = [
      {
        source: {
          type: 'device',
          driverId: 'DexcomG4',
          usb: 3,
          connected: false
        }
      }
      ];
      connectedDevices = [{
        driverId: 'DexcomG4',
        usb: 3
      }];

      appActions.detectDevices(function(err) {
        if (err) throw err;
        expect(app.state.uploads).to.have.length(1);
        expect(app.state.uploads[0].source.connected).to.be.true;
        done();
      });
    });

    it('updates connected device info', function(done) {
      app.state.uploads = [
      {
        source: {
          type: 'device',
          driverId: 'DexcomG4',
          usb: 3,
          connected: true
        }
      }
      ];
      connectedDevices = [{
        driverId: 'DexcomG4',
        usb: 11
      }];

      appActions.detectDevices(function(err) {
        if (err) throw err;
        expect(app.state.uploads).to.have.length(1);
        expect(app.state.uploads[0].source.usb).to.equal(11);
        done();
      });
    });

  });

  describe('uploadDevice', function() {

    it('throws an error if upload index is invalid', function() {
      app.state.uploads = [];

      expect(appActions.upload.bind(appActions, 0))
        .to.throw(/index/);
    });

    it('throws an error if an upload is already in progress', function() {
      app.state.uploads = [{
        progress: {}
      }];

      expect(appActions.upload.bind(appActions, 0))
        .to.throw(/progress/);
    });

    it('starts upload with correct progress data', function() {
      now = '2014-01-31T22:00:00-05:00';
      device.detect = _.noop;
      device.upload = _.noop;
      app.state.targetId = '11';
      app.state.uploads = [{
        source: {
          type: 'device',
          driverId: 'DexcomG4'
        }
      }];

      appActions.upload(0, {}, _.noop);
      expect(app.state.uploads[0].progress).to.deep.equal({
        targetId: '11',
        start: '2014-01-31T22:00:00-05:00',
        step: 'start',
        percentage: 0
      });
    });

    it('updates upload with correct progress data', function(done) {
      device.detect = function(driverId, cb) { return cb(null, {}); };
      device.upload = function(driverId, options, cb) {
        options.progress('foo', 50);
        expect(app.state.uploads[0].progress).to.have.property('step', 'foo');
        expect(app.state.uploads[0].progress).to.have.property('percentage', 50);
        return cb();
      };
      app.state.targetId = '11';
      app.state.uploads = [{
        source: {
          type: 'device',
          driverId: 'DexcomG4'
        }
      }];

      appActions.upload(0, {}, done);
    });

    it('adds correct object to upload history when complete and clears progress', function(done) {
      now = '2014-01-31T22:00:00-05:00';
      device.detect = function(driverId, cb) { return cb(null, {}); };
      device.upload = function(driverId, options, cb) {
        now = '2014-01-31T22:00:30-05:00';
        options.progress('cleanup', 100);
        var records = [{}, {}];
        return cb(null, records);
      };
      app.state.targetId = '11';
      app.state.uploads = [{
        source: {
          type: 'device',
          driverId: 'DexcomG4'
        }
      }];

      appActions.upload(0, {}, function(err) {
        if (err) throw err;
        expect(app.state.uploads[0].progress).to.be.undefined;
        expect(app.state.uploads[0].history).to.have.length(1);
        expect(app.state.uploads[0].history[0]).to.deep.equal({
          targetId: '11',
          start: '2014-01-31T22:00:00-05:00',
          finish: '2014-01-31T22:00:30-05:00',
          step: 'cleanup',
          percentage: 100,
          success: true,
          count: 2
        });
        done();
      });
    });

    it('adds correct object to upload history when upload failed', function(done) {
      now = '2014-01-31T22:00:00-05:00';
      device.detect = function(driverId, cb) { return cb(null, {}); };
      device.upload = function(driverId, options, cb) {
        now = '2014-01-31T22:00:30-05:00';
        options.progress('fetchData', 50);
        var err = 'oops';
        return cb(err);
      };
      app.state.targetId = '11';
      app.state.uploads = [{
        source: {
          type: 'device',
          driverId: 'DexcomG4'
        }
      }];

      appActions.upload(0, {}, function(err) {
        if (err && err !== 'oops') throw err;
        expect(app.state.uploads[0].history).to.have.length(1);
        expect(app.state.uploads[0].history[0]).to.deep.equal({
          targetId: '11',
          start: '2014-01-31T22:00:00-05:00',
          finish: '2014-01-31T22:00:30-05:00',
          step: 'fetchData',
          percentage: 50,
          error: 'oops'
        });
        done();
      });
    });

    it('adds to upload history most recent first', function(done) {
      device.detect = function(driverId, cb) { return cb(null, {}); };
      device.upload = function(driverId, options, cb) { return cb(null, []); };
      app.state.uploads = [{
        source: {
          type: 'device',
          driverId: 'DexcomG4'
        },
        history: [
          {targetId: '1'}
        ]
      }];
      app.state.targetId = '2';

      appActions.upload(0, {}, function(err) {
        if (err) throw err;
        expect(app.state.uploads[0].history).to.have.length(2);
        expect(app.state.uploads[0].history[0].targetId).to.equal('2');
        expect(app.state.uploads[0].history[1].targetId).to.equal('1');
        done();
      });
    });

  });

});