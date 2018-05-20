'use strict'

var fs = require('fs')

var file_count = parseInt(process.argv[2])

if (!fs.existsSync('bench')) {
  fs.mkdirSync('bench')
} else {
  var files = fs.readdirSync('bench')
  for (var file of files) fs.unlinkSync(`bench/${file}`)
}

for (var i = 0; i < file_count; i++) {
  fs.writeFile(`bench/${i}.js`, `${i} * ${i};`, err => {
    if (err) throw err
  })
}
