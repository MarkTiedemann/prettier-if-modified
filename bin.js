#!/usr/bin/env node
'use strict'

var fs = require('fs')
var path = require('path')
var stream = require('stream')
var events = require('events')
var child_process = require('child_process')

var glob_stream = require('glob-stream')
var fs_attributes = require('fs-extended-attributes')

// See: https://support.microsoft.com/en-us/help/830473/command-prompt-cmd-exe-command-line-string-limitation
var MAX_COMMAND_LENGTH = 8192

// TODO: properly parse arguments and options
main(process.argv[2], err => {
  if (err) console.error(err)
  process.exitCode = 1
})

function main(pattern, onError) {
  var files = []
  glob_stream([pattern, '!node_modules/**'])
    .pipe(transform_glob())
    .on('error', onError)
    .on('data', file => files.push(file))
    .on('end', () => {
      files = files.filter(file => file.last_formatted < file.last_modified)
      files = files.map(file => file.file_path)
      var length = calc_command_length(files)
      // TODO: split invocations if too long
      if (files.length > 0) format_files(files, onError)
    })
}

function calc_command_length(files) {
  // TODO: calc length properly
  return files.join(' ').length + 'prettier --write '.length
}

function transform_glob() {
  return new stream.Transform({
    objectMode: true,

    transform(chunk, encoding, callback) {
      var file_path = path.relative(process.cwd(), chunk.path)
      var last_modified = undefined
      var last_formatted = undefined

      var result = () => ({
        file_path: file_path,
        last_modified: last_modified,
        last_formatted: last_formatted
      })

      fs.stat(file_path, (err, stat) => {
        if (err) return callback(err)
        last_modified = stat.mtimeMs
        if (last_formatted !== undefined) {
          callback(null, result())
        }
      })

      fs_attributes.get(file_path, 'last_formatted', (err, attr) => {
        if (err) return callback(err)
        last_formatted = attr === null ? 0 : parseFloat(attr)
        if (last_modified !== undefined) {
          callback(null, result())
        }
      })
    }
  })
}

function format_files(files, onError) {
  // TODO: perhaps use prettier from node_modules (?)
  var bin = process.platform === 'win32' ? 'prettier.cmd' : 'prettier'
  // TODO: user proper arguments
  var args = ['--write', ...files]
  var prettier = child_process.spawn(bin, args)
  prettier.stdout.pipe(process.stdout)
  prettier.stderr.pipe(process.stderr)
  prettier.on('close', code => {
    if (code === 0) update_file_times(files, onError)
    else onError()
  })
}

function update_file_times(files, onError) {
  var now = Date.now()
  var last_modified = new Date(now - 1)
  var last_formatted = new Date(now)
  var last_formatted_string = last_formatted.getTime().toString()

  files.forEach(file => {
    fs_attributes.set(file, 'last_formatted', last_formatted_string, err => {
      if (err) onError(err)
      else
        fs.utimes(file, last_formatted, last_modified, err => {
          if (err) onError(err)
        })
    })
  })
}
