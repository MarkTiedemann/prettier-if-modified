#!/usr/bin/env node
'use strict'

let fs = require('fs')
let path = require('path')
let stream = require('stream')
let child_process = require('child_process')

let glob_stream = require('glob-stream')
let fs_attributes = require('fs-extended-attributes')

main(parse_args(process.argv.slice(2)), err => {
  if (err) console.error(err)
  process.exitCode = 1
})

function main(args, on_error) {
  let files = []
  glob_stream([...args.patterns, '!node_modules/**', ...args.ignore_patterns])
    .pipe(transform_glob())
    .on('error', on_error)
    .on('data', file => files.push(file))
    .once('end', () => prepare_format(args, files, on_error))
}

function transform_glob() {
  return new stream.Transform({
    objectMode: true,

    transform(chunk, encoding, callback) {
      let file_path = path.relative(process.cwd(), chunk.path)
      let last_modified = undefined
      let last_formatted = undefined

      let result = () => ({
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

function prepare_format(args, files, on_error) {
  files = files
    .filter(file => file.last_formatted < file.last_modified)
    .map(file => file.file_path)

  // See: https://support.microsoft.com/en-us/help/830473/command-prompt-cmd-exe-command-line-string-limitation
  let max_command_length = process.platform === 'win32' ? 2047 : 32768

  // Work-around command line length limitation by splitting the files
  // into properly sized chunks and spawning prettier multiple times
  while (files.length > 0) {
    let command = [args.prettier_bin, ...args.prettier_args]
    while (files.length > 0) {
      command.push(files.shift())
      if (command.join(' ').length > max_command_length) {
        files.unshift(command.pop())
        break
      }
    }
    format_files(
      args.prettier_bin,
      args.prettier_args,
      command.splice(2),
      on_error
    )
  }
}

function format_files(bin, args, files, on_error) {
  let child = child_process.spawn(bin, [...args, ...files])
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)
  child.on('close', code => {
    if (code === 0) {
      if (
        (bin === 'prettier' || bin === 'prettier.cmd') &&
        args.includes('--write')
      ) {
        update_file_times(files, on_error)
      }
    } else on_error()
  })
}

function update_file_times(files, on_error) {
  let now = Date.now()
  let last_modified = new Date(now - 1)
  let last_formatted = new Date(now)
  let last_formatted_string = last_formatted.getTime().toString()

  files.forEach(file => {
    fs_attributes.set(file, 'last_formatted', last_formatted_string, err => {
      if (err) on_error(err)
      else
        fs.utimes(file, last_formatted, last_modified, err => {
          if (err) on_error(err)
        })
    })
  })
}

function parse_args(args) {
  if (args.length === 0) {
    print_usage()
  }

  let ignore_patterns = []
  if (args[0] === '--ignore-path') {
    if (!args[1] || args[1] === '--') {
      print_usage()
    } else {
      ignore_patterns = fs
        .readFileSync(args[1])
        .toString()
        .split(/\r?\n/g)
        .map(x => x.trim())
        .filter(Boolean)
        .filter(x => !x.startsWith('#'))
        .map(x => '!' + x)
      args = args.slice(2)
    }
  }

  let split_index = args.indexOf('--')
  if (
    split_index === -1 ||
    split_index === 0 ||
    split_index === args.length - 1
  ) {
    print_usage()
  }

  let patterns = args.slice(0, split_index)
  let prettier_args = args.slice(split_index + 1)
  let prettier_bin = prettier_args.shift()
  if (prettier_bin === 'prettier' && process.platform === 'win32') {
    prettier_bin = 'prettier.cmd'
  }

  return { ignore_patterns, patterns, prettier_bin, prettier_args }
}

function print_usage() {
  console.error(
    'Usage: prettier-if-modified [opts] [filename ...] -- [prettier command]'
  )
  process.exit(1)
}
