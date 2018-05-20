#!/usr/bin/env node
'use strict'

var fs = require('fs')
var path = require('path')
var stream = require('stream')
var child_process = require('child_process')

var glob_stream = require('glob-stream')
var fs_attributes = require('fs-extended-attributes')

main(process.argv[2])

function main(pattern) {
  var files = []
  var errors = []
  glob_stream([pattern, '!node_modules/**'])
    .pipe(transform_glob())
    .on('error', err => errors.push(err))
    .on('data', file => files.push(file))
    .on('end', () => {
      check_errors(errors)
      files = files.filter(file => file.last_formatted < file.last_modified)
      files = files.map(file => file.file_path)
      if (files.length > 0) format_files(files)
    })
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

function format_files(files) {
  var bin = process.platform === 'win32' ? 'prettier.cmd' : 'prettier'
  var args = ['--write', ...files]
  var on_close = code => {
    if (code === 0) update_file_times(files)
    else process.exit(code)
  }

  var prettier = child_process.spawn(bin, args)
  prettier.stdout.pipe(process.stdout)
  prettier.stderr.pipe(process.stderr)
  prettier.on('close', on_close)
}

function update_file_times(files) {
  var errors = []
  var pending = files.length * 2

  var now = Date.now()
  var last_modified = new Date(now - 1)
  var last_formatted = new Date(now)
  var last_formatted_string = last_formatted.getTime().toString()

  files.forEach(file => {
    fs_attributes.set(file, 'last_formatted', last_formatted_string, err => {
      pending--
      if (err) {
        errors.push(err)
        return pending--
      }

      fs.utimes(file, last_formatted, last_modified, err => {
        pending--
        if (err) errors.push(err)
        if (pending === 0) check_errors(errors)
      })
    })
  })
}

function check_errors(errors) {
  if (errors.length > 0) {
    errors.forEach(err => console.error(err))
    process.exit(1)
  }
}
