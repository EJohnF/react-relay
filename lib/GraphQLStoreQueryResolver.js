/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @providesModule GraphQLStoreQueryResolver
 * 
 */

'use strict';

var _classCallCheck3 = _interopRequireDefault(require('babel-runtime/helpers/classCallCheck'));

var _keys2 = _interopRequireDefault(require('babel-runtime/core-js/object/keys'));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

/**
 * @internal
 *
 * Resolves data from fragment pointers.
 *
 * The supplied `callback` will be invoked whenever data returned by the last
 * invocation to `resolve` has changed.
 */

var GraphQLStoreQueryResolver = function () {
  function GraphQLStoreQueryResolver(storeData, fragment, callback) {
    (0, _classCallCheck3['default'])(this, GraphQLStoreQueryResolver);

    this.dispose();
    this._callback = callback;
    this._fragment = fragment;
    this._resolver = null;
    this._storeData = storeData;
  }

  /**
   * disposes the resolver's internal state such that future `resolve()` results
   * will not be `===` to previous results, and unsubscribes any subscriptions.
   */


  GraphQLStoreQueryResolver.prototype.dispose = function dispose() {
    if (this._resolver) {
      this._resolver.dispose();
    }
  };

  GraphQLStoreQueryResolver.prototype.resolve = function resolve(fragment, dataIDs) {
    // Warn but don't crash if resolved with the wrong fragment.
    if (this._fragment.getConcreteFragmentID() !== fragment.getConcreteFragmentID()) {
      require('fbjs/lib/warning')(false, 'GraphQLStoreQueryResolver: Expected `resolve` to be called with the ' + 'same concrete fragment as the constructor. The resolver was created ' + 'with fragment `%s` but resolved with fragment `%s`.', this._fragment.getDebugName(), fragment.getDebugName());
    }
    // Rather than crash on mismatched plurality of fragment/ids just warn
    // and resolve as if the fragment's pluarity matched the format of the ids.
    // Note that the inverse - attempt to resolve based on fragment plurarity -
    // doesn't work because there's no way convert plural ids to singular w/o
    // losing data.
    if (Array.isArray(dataIDs)) {
      // Fragment should be plural if data is pluaral.
      require('fbjs/lib/warning')(fragment.isPlural(), 'GraphQLStoreQueryResolver: Expected id/fragment plurality to be ' + 'consistent: got plural ids for singular fragment `%s`.', fragment.getDebugName());
      var resolver = this._resolver;
      if (resolver instanceof GraphQLStoreSingleQueryResolver) {
        resolver.dispose();
        resolver = null;
      }
      if (!resolver) {
        resolver = new GraphQLStorePluralQueryResolver(this._storeData, this._callback);
      }
      this._resolver = resolver;
      return resolver.resolve(fragment, dataIDs);
    } else {
      // Fragment should be singular if data is singular.
      require('fbjs/lib/warning')(!fragment.isPlural(), 'GraphQLStoreQueryResolver: Expected id/fragment plurality to be ' + 'consistent: got a singular id for plural fragment `%s`.', fragment.getDebugName());
      var _resolver = this._resolver;
      if (_resolver instanceof GraphQLStorePluralQueryResolver) {
        _resolver.dispose();
        _resolver = null;
      }
      if (!_resolver) {
        _resolver = new GraphQLStoreSingleQueryResolver(this._storeData, this._callback);
      }
      this._resolver = _resolver;
      return _resolver.resolve(fragment, dataIDs);
    }
  };

  return GraphQLStoreQueryResolver;
}();

/**
 * Resolves plural fragments.
 */


var GraphQLStorePluralQueryResolver = function () {
  function GraphQLStorePluralQueryResolver(storeData, callback) {
    (0, _classCallCheck3['default'])(this, GraphQLStorePluralQueryResolver);

    this.dispose();
    this._callback = callback;
    this._storeData = storeData;
  }

  GraphQLStorePluralQueryResolver.prototype.dispose = function dispose() {
    if (this._resolvers) {
      this._resolvers.forEach(function (resolver) {
        return resolver.dispose();
      });
    }
    this._resolvers = [];
    this._results = [];
  };

  /**
   * Resolves a plural fragment pointer into an array of records.
   *
   * If the data, order, and number of resolved records has not changed since
   * the last call to `resolve`, the same array will be returned. Otherwise, a
   * new array will be returned.
   */


  GraphQLStorePluralQueryResolver.prototype.resolve = function resolve(fragment, nextIDs) {
    var prevResults = this._results;
    var nextResults = void 0;

    var prevLength = prevResults.length;
    var nextLength = nextIDs.length;
    var resolvers = this._resolvers;

    // Ensure that we have exactly `nextLength` resolvers.
    while (resolvers.length < nextLength) {
      resolvers.push(new GraphQLStoreSingleQueryResolver(this._storeData, this._callback));
    }
    while (resolvers.length > nextLength) {
      resolvers.pop().dispose();
    }

    // Allocate `nextResults` if and only if results have changed.
    if (prevLength !== nextLength) {
      nextResults = [];
    }
    for (var ii = 0; ii < nextLength; ii++) {
      var nextResult = resolvers[ii].resolve(fragment, nextIDs[ii]);
      if (nextResults || ii >= prevLength || nextResult !== prevResults[ii]) {
        nextResults = nextResults || prevResults.slice(0, ii);
        nextResults.push(nextResult);
      }
    }

    if (nextResults) {
      this._results = nextResults;
    }
    return this._results;
  };

  return GraphQLStorePluralQueryResolver;
}();

/**
 * Resolves non-plural fragments.
 */


var GraphQLStoreSingleQueryResolver = function () {
  function GraphQLStoreSingleQueryResolver(storeData, callback) {
    (0, _classCallCheck3['default'])(this, GraphQLStoreSingleQueryResolver);

    this.dispose();
    this._callback = callback;
    this._garbageCollector = storeData.getGarbageCollector();
    this._storeData = storeData;
    this._subscribedIDs = {};
  }

  GraphQLStoreSingleQueryResolver.prototype.dispose = function dispose() {
    if (this._subscription) {
      this._subscription.remove();
    }
    this._hasDataChanged = false;
    this._fragment = null;
    this._result = null;
    this._resultID = null;
    this._subscription = null;
    this._updateGarbageCollectorSubscriptionCount({});
    this._subscribedIDs = {};
  };

  /**
   * Resolves data for a single fragment pointer.
   */


  GraphQLStoreSingleQueryResolver.prototype.resolve = function resolve(nextFragment, nextID) {
    var prevFragment = this._fragment;
    var prevID = this._resultID;
    var nextResult = void 0;
    var prevResult = this._result;
    var subscribedIDs = void 0;

    if (prevFragment != null && prevID != null && this._getCanonicalID(prevID) === this._getCanonicalID(nextID)) {
      if (prevID !== nextID || this._hasDataChanged || !nextFragment.isEquivalent(prevFragment)) {
        var _resolveFragment2 = this._resolveFragment(nextFragment, nextID);
        // same canonical ID,
        // but the data, call(s), route, and/or variables have changed


        nextResult = _resolveFragment2[0];
        subscribedIDs = _resolveFragment2[1];

        nextResult = require('./recycleNodesInto')(prevResult, nextResult);
      } else {
        // same id, route, variables, and data
        nextResult = prevResult;
      }
    } else {
      var _resolveFragment3 = this._resolveFragment(nextFragment, nextID);
      // Pointer has a different ID or is/was fake data.


      nextResult = _resolveFragment3[0];
      subscribedIDs = _resolveFragment3[1];
    }

    // update subscriptions whenever results change
    if (prevResult !== nextResult) {
      if (this._subscription) {
        this._subscription.remove();
        this._subscription = null;
      }
      if (subscribedIDs) {
        // always subscribe to the root ID
        subscribedIDs[nextID] = true;
        var changeEmitter = this._storeData.getChangeEmitter();
        this._subscription = changeEmitter.addListenerForIDs((0, _keys2['default'])(subscribedIDs), this._handleChange.bind(this));
        this._updateGarbageCollectorSubscriptionCount(subscribedIDs);
        this._subscribedIDs = subscribedIDs;
      }
      this._resultID = nextID;
      this._result = nextResult;
    }

    this._hasDataChanged = false;
    this._fragment = nextFragment;

    return this._result;
  };

  /**
   * Ranges publish events for the entire range, not the specific view of that
   * range. For example, if "client:1" is a range, the event is on "client:1",
   * not "client:1_first(5)".
   */


  GraphQLStoreSingleQueryResolver.prototype._getCanonicalID = function _getCanonicalID(id) {
    return this._storeData.getRangeData().getCanonicalClientID(id);
  };

  GraphQLStoreSingleQueryResolver.prototype._handleChange = function _handleChange() {
    if (!this._hasDataChanged) {
      this._hasDataChanged = true;
      this._callback();
    }
  };

  GraphQLStoreSingleQueryResolver.prototype._resolveFragment = function _resolveFragment(fragment, dataID) {
    var _readRelayQueryData = require('./readRelayQueryData')(this._storeData, fragment, dataID);

    var data = _readRelayQueryData.data;
    var dataIDs = _readRelayQueryData.dataIDs;

    return [data, dataIDs];
  };

  /**
   * Updates bookkeeping about the number of subscribers on each record.
   */


  GraphQLStoreSingleQueryResolver.prototype._updateGarbageCollectorSubscriptionCount = function _updateGarbageCollectorSubscriptionCount(nextDataIDs) {
    var _this = this;

    if (this._garbageCollector) {
      (function () {
        var garbageCollector = _this._garbageCollector;
        var rangeData = _this._storeData.getRangeData();
        var prevDataIDs = _this._subscribedIDs;

        // Note: the same canonical ID may appear in both removed and added: in
        // that case, it would have been:
        // - previous step: canonical ID ref count was incremented
        // - current step: canonical ID is incremented *and* decremented
        // Note that the net ref count change is +1.
        (0, _keys2['default'])(nextDataIDs).forEach(function (id) {
          id = rangeData.getCanonicalClientID(id);
          garbageCollector.incrementReferenceCount(id);
        });
        (0, _keys2['default'])(prevDataIDs).forEach(function (id) {
          id = rangeData.getCanonicalClientID(id);
          garbageCollector.decrementReferenceCount(id);
        });
      })();
    }
  };

  return GraphQLStoreSingleQueryResolver;
}();

require('./RelayProfiler').instrumentMethods(GraphQLStoreQueryResolver.prototype, {
  resolve: 'GraphQLStoreQueryResolver.resolve'
});

module.exports = GraphQLStoreQueryResolver;