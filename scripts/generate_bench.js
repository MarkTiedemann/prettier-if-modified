'use strict'

let fs = require('fs')

let file_count = parseInt(process.argv[2])

if (!fs.existsSync('bench')) {
  fs.mkdirSync('bench')
} else {
  let files = fs.readdirSync('bench')
  for (let file of files) fs.unlinkSync(`bench/${file}`)
}

for (let i = 0; i < file_count; i++) {
  fs.writeFile(`bench/${i}.js`, `${i} * ${i};`, err => {
    if (err) throw err
  })
}
