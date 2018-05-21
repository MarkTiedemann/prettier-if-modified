# prettier-if-modified

**Run `prettier` only on modified files.**

This module uses file attributes to keep track of when files have been modified and formatted. Only files that have been modified after they have been formatted will be passed on to `prettier` to be formatted again. As such, this module enables incremental formatting for codebases of all sizes.

## Usage

**Non-incremental:**

```sh
prettier --write "**/*.js"
```

**Incremental:**

```sh
prettier-if-modified "**/*.js" -- prettier --write
```

**With `.prettierignore`:**

```sh
prettier-if-modified --ignore-path .prettierignore "**/*.js" -- prettier --write
```

**Print files that would be formatted:**

```sh
prettier-if-modified "**/*.js" -- echo
```

## Algorithm

```js
// WARNING: THIS IS DANGEROUSLY SIMPLIFIED PSEUDO CODE

var all_files = find('**/*.js')

var modified_files = all_files.filter(file => {
  var last_modified = get_attribute(file, 'last_modified')
  var last_formatted = get_attribute(file, 'last_formatted')
  return last_modified > last_formatted
})

prettier(modified_files)

var last_formatted = Date.now()
modified_files.forEach(file => {
  set_attribute(file, 'last_formatted', last_formatted)
})
```

## Development

```sh
# Install dependencies
yarn install

# Format source code
yarn format
```

## License

MIT © [Mark Tiedemann](https://marksweb.site)
