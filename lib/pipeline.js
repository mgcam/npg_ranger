"use strict";

/**
 * pipeline module.
 * @module lib/pipeline
 * @param {Array} processes an array of child processes
 * @param {Function} onSuccessClbk function to call if all processes succeed
 * @param {Function} onFailureClbk function to call if one of processes fails
 *
 * @description Pipes input processes into each other and into destination.
 *              Sets up callbaks to inform the caller on the success or
 *              failure of the pipeline. Schedules to start the pipeline on
 *              the next event loop iteration with nextTick(). The pipeline is
 *              run asynchronously. Promises are used to get feedback.
 *
 * @example <caption>Example usage of the pipeline module.</caption>
 *   const pipeline = require('../lib/pipeline.js');
 *   const cat = spawn('cat', ['file']);
 *   const wc = spawn('wc', ['-l']);
 *   var success = function() {console.log('Success')};
 *   var failure = function() {console.log('Failed')};
 *   var pline = pipeline([cat, wc], success, failure);
 *   pline.run(process.stdout);
 *
 * @author Marina Gourtovaia
 * @copyright Genome Research Limited 2016
 */

const EventEmitter = require('events');

module.exports = (processes, onSuccessClbk, onFailureClbk) => {

  function createPromise(p) {

    return new Promise(
      function(resolve, reject) {
        p.on('close', function(code, signal) {
          if (code || signal) {
            reject(code || signal);
          } else {
            resolve();
          }
        });
        p.on('error',        (err) => {
          reject(err);
        });
        p.stdin.on('error',  (err) => {
          reject(err);
        });
        p.stdout.on('error', (err) => {
          reject(err);
        });
      }
    );
  }

  function registerOutcomes() {

    var promises = processes.map(
      function(process) {return createPromise(process);});

    promises.forEach(function(promise, i) {
      var title = processes[i].title || 'process_' + i;
      promise.then(
        // Report success
        function() {
          console.log('SUCCESS ' + title);
        }
      )
      .catch(
        // Log the rejection reason
        function(code) {
          console.log('ERROR ' + title + ' ' + code);
        }
      );
    });

    Promise.all(promises).then(onSuccessClbk, onFailureClbk);
  }

  function schedule(destination) {
    /* On the next iteration of the main event loop,
     * prior to processing any IO,
     * wire the pipeline thus implicitly starting computation.
     */
    var numProcesses = processes.length;
    process.nextTick(() => {
      processes.forEach(function(current, index, array) {
        // For each process but the last one,
        if (index < numProcesses - 1) {
          // pipe the optput of the current one
          // to the input of the next one.
          current.stdout.pipe(array[index + 1].stdin);
        }
      });
      // The last process' output is piped to the destination
      processes[numProcesses - 1].stdout.pipe(destination, {end: false});
    });
  }

  function validateInput() {
    if (!processes) {
      throw new ReferenceError('Array of processes should be defined');
    }
    if (processes instanceof Array === false) {
      throw new TypeError('processes should be an array');
    }
    if (processes.length === 0) {
      throw new RangeError('processes array cannot be empty');
    }
    processes.forEach(function(p, index) {
      if (!p) {
        throw new ReferenceError(`Undefined process at index ${index}`);
      }
      if (p instanceof EventEmitter === false) {
        throw new TypeError(`Not an event emitter at index ${index}`);
      }
    });

    if (!onSuccessClbk) {
      throw new ReferenceError('Success callback should be defined');
    }
    if (onSuccessClbk instanceof Function === false) {
      throw new TypeError('Success callback should be a function');
    }
    if (!onFailureClbk) {
      throw new ReferenceError('Failure callback should be defined');
    }
    if (onFailureClbk instanceof Function === false) {
      throw new TypeError('Failure callback should be a function');
    }
  }

  return {
    /** Set up and run the pipeline.
     * @param destination - a writable stream
     */
    run: (destination) => {
      if (!destination) {
        throw new ReferenceError('Destination stream is not defined');
      }
      validateInput();
      registerOutcomes();
      schedule(destination);
    },
  };
};