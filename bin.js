#!/usr/bin/env node
'use strict'

const fs = require('fs')
const EventEmitter = require('events')
const { Glob } = require('glob')
const prettier = require('prettier')
const lib = require('./lib')

const LOCK = 'prettier.lock'
const LENIENCY = 10 // ms

if (!fs.existsSync(LOCK)) {
  fs.writeFileSync(LOCK, lib.stringifyLockFile([]))
}

let lock = fs.readFileSync(LOCK)
let mods = lib.parseLockFile(lock)

let pattern = process.argv[2]
let pending = 0
let done = false

let emitter = new EventEmitter()
emitter.on('done', onDone)

new Glob(pattern, { ignore: ['node_modules'] })
  .on('error', onError)
  .on('match', onMatch)
  .on('end', onEnd)

function onError(err) {
  throw err
}

function onEnd() {
  done = true
  checkDone()
}

function onDone() {
  fs.writeFileSync(LOCK, lib.stringifyLockFile(mods))
}

function onMatch(file) {
  if (!lib.isPrettierSupportedExt(file)) {
    return checkDone()
  }

  pending++

  fs.stat(file, (err, stat) => {
    if (err) throw err

    let modIndex = mods.findIndex(m => m.file === file)
    let mod
    if (modIndex === -1) {
      mod = {
        file,
        mtimeMs: 0,
        size: stat.size
      }
      mods.push(mod)
      modIndex = mods.length - 1
    } else {
      mod = mods[modIndex]
    }

    let prevSize = mod.size
    let currSize = stat.size

    let prevMtime = mod.mtimeMs
    let currMtime = stat.mtimeMs - LENIENCY

    let fmtMtime = x => (x <= 0 ? x.toFixed(2) : '+' + x.toFixed(2))
    let mtimeDiff = fmtMtime(currMtime - prevMtime)

    let fmtSize = x => (x <= 0 ? x : '+' + x)
    let sizeDiff = fmtSize(currSize - prevSize)

    if (prevSize !== currSize || prevMtime < currMtime) {
      console.log(`${file} [${mtimeDiff}ms, ${sizeDiff}b]`)
      fs.readFile(file, async (err, buf) => {
        if (err) throw err

        let config = await prettier.resolveConfig(file)
        let source = buf.toString()
        source = prettier.format(source, {
          ...config,
          parser: lib.getPrettierParser(file)
        })
        buf = Buffer.from(source)
        fs.writeFile(file, buf, err => {
          if (err) throw err

          mods[modIndex] = {
            file,
            mtimeMs: Date.now(),
            size: buf.length
          }
          pending--
          checkDone()
        })
      })
    } else {
      pending--
      checkDone()
    }
  })
}

function checkDone() {
  if (pending === 0 && done) {
    emitter.emit('done')
  }
}
