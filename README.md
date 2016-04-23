# buildkite-update-initial-step

Updates the initial step across all pipelines in an organisation.

## Install

```
npm install -g buildkite-update-initial-step
```

## Usage

```
buildkite-update-initial-step config.json
```

### Config File

```js
{
  "org": "myorganisation",
  "token": "abc123",
  "repositories": {
    "exclude": [
      "wip-pipeline"
    ]
  },
  "step": {
    "type": "script",
    "name": "bootstrap :soon:",
    "command": "cat pipeline.json | buildkite pipeline upload"
  }
}
```

You can omit `token` and set `BUILDKITE_TOKEN` env var instead if want to commit this configuration into version control.

### LICENSE

ISC
