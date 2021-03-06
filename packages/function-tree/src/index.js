'use strict'

const EventEmitter = require('events')
const executeTree = require('./executeTree')
const createStaticTree = require('./staticTree')
const ExecutionProvider = require('./providers/Execution')
const InputProvider = require('./providers/Input')
const PathProvider = require('./providers/Path')
const assign = require('object-assign')
const Path = require('./Path')
const Abort = require('./Abort')

function createUniqueId () {
  return Date.now() + '_' + Math.floor(Math.random() * 10000)
}

function isValidResult (result) {
  return (
    !result ||
    (
      result &&
      !Array.isArray(result) &&
      typeof result === 'object'
    )
  )
}

function FunctionTreeExecution (name, staticTree, functionTree, errorCallback) {
  this.id = createUniqueId()
  this.name = name
  this.staticTree = staticTree
  this.functionTree = functionTree
  this.datetime = Date.now()
  this.errorCallback = errorCallback

  this.runFunction = this.runFunction.bind(this)
}

FunctionTreeExecution.prototype.runFunction = function (funcDetails, payload, next) {
  const context = this.createContext(funcDetails, payload)
  const functionTree = this.functionTree
  const errorCallback = this.errorCallback
  const execution = this

  functionTree.emit('functionStart', execution, funcDetails, payload)
  const result = funcDetails.function(context)

  if (result instanceof Abort) {
    return functionTree.emit('abort', execution, funcDetails, payload)
  }

  if (result && result.then && result.catch && typeof result.then === 'function' && typeof result.catch === 'function') {
    functionTree.emit('asyncFunction', execution, funcDetails, payload)
    result
      .then(function (result) {
        if (result instanceof Path) {
          functionTree.emit('functionEnd', execution, funcDetails, payload)
          next(result.toJS())
        } else if (funcDetails.outputs) {
          functionTree.emit('functionEnd', execution, funcDetails, payload)
          throw new Error('The result ' + JSON.stringify(result) + ' from function ' + funcDetails.name + ' needs to be a path')
        } else if (isValidResult(result)) {
          functionTree.emit('functionEnd', execution, funcDetails, payload)
          next({
            payload: result
          })
        } else {
          functionTree.emit('functionEnd', execution, funcDetails, payload)
          throw new Error('The result ' + JSON.stringify(result) + ' from function ' + funcDetails.name + ' is not a valid result')
        }
      })
      .catch(function (result) {
        if (result instanceof Error) {
          errorCallback(result)
        } else if (result instanceof Path) {
          functionTree.emit('functionEnd', execution, funcDetails, payload)
          next(result.toJS())
        } else if (funcDetails.outputs) {
          let error = new Error('The result ' + JSON.stringify(result) + ' from function ' + funcDetails.name + ' needs to be a path')

          errorCallback(error)
        } else if (isValidResult(result)) {
          functionTree.emit('functionEnd', execution, funcDetails, payload)
          next({
            payload: result
          })
        } else {
          let error = new Error('The result ' + JSON.stringify(result) + ' from function ' + funcDetails.name + ' is not a valid result')

          errorCallback(error)
        }
      })
  } else if (result instanceof Path) {
    functionTree.emit('functionEnd', execution, funcDetails, payload)
    next(result.toJS())
  } else if (funcDetails.outputs) {
    let error = new Error('The result ' + JSON.stringify(result) + ' from function ' + funcDetails.name + ' needs to be a path')

    errorCallback(error)
  } else if (isValidResult(result)) {
    functionTree.emit('functionEnd', execution, funcDetails, payload)
    next({
      payload: result
    })
  } else {
    let error = new Error('The result ' + JSON.stringify(result) + ' from function ' + funcDetails.name + ' is not a valid result')
    errorCallback(error)
  }
}

FunctionTreeExecution.prototype.createContext = function (action, payload) {
  return [
    ExecutionProvider(this, Abort),
    InputProvider(),
    PathProvider()
  ].concat(this.functionTree.contextProviders).reduce(function (currentContext, contextProvider) {
    var newContext = (
      typeof contextProvider === 'function'
        ? contextProvider(currentContext, action, payload)
        : assign(currentContext, contextProvider)
    )

    if (newContext !== currentContext) {
      throw new Error('function-tree: You are not returning the context from a provider')
    }

    return newContext
  }, {})
}

function FunctionTree (contextProviders) {
  if (
    !this || (typeof window !== 'undefined' && this === window)
  ) {
    return new FunctionTree(contextProviders)
  }

  this.cachedTrees = []
  this.cachedStaticTrees = []
  this.contextProviders = contextProviders || []
  this.runTree = this.runTree.bind(this)
  this.runTree.on = this.on.bind(this)
  this.runTree.once = this.once.bind(this)
  this.runTree.off = this.removeListener.bind(this)

  return this.runTree
}

FunctionTree.prototype = Object.create(EventEmitter.prototype)

FunctionTree.prototype.runTree = function () {
  var name
  var tree
  var payload
  var cb
  var staticTree
  var args = [].slice.call(arguments)
  args.forEach(function (arg) {
    if (typeof arg === 'string') {
      name = arg
      return
    } else if (Array.isArray(arg)) {
      tree = arg
    } else if (typeof arg === 'function') {
      cb = arg
    } else {
      payload = arg
    }
  })

  if (!tree) {
    throw new Error('function-tree - You did not pass in a function tree')
  }

  if (this.cachedTrees.indexOf(tree) === -1) {
    staticTree = createStaticTree(tree)
    this.cachedTrees.push(tree)
    this.cachedStaticTrees.push(staticTree)
  } else {
    staticTree = this.cachedStaticTrees[this.cachedTrees.indexOf(tree)]
  }
  var execution = new FunctionTreeExecution(name, staticTree, this, function (error) {
    cb && cb(error, execution, payload)
    setTimeout(function () {
      this.emit('error', error, execution, payload)
    }.bind(this))
  }.bind(this))

  this.emit('start', execution, payload)
  executeTree(execution.staticTree, execution.runFunction, payload, function () {
    this.emit('end', execution, payload)
    cb && cb(null, execution, payload)
  }.bind(this))
}

module.exports = FunctionTree
