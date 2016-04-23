import path from 'path'

import 'colors'

import Buildnode from 'buildnode'
import s from 'ht-schema'
import equal from 'deep-equal'
import inquirer from 'inquirer'
import async from 'async'

const confFileName = process.argv[2]

if (!confFileName) {
  console.error(`Usage: ${path.basename(process.argv[1])} conf.json`)
  process.exit(1)
}

let config

try {
  config = require(path.resolve(process.cwd(), confFileName))
} catch (e) {
  console.error('There was an error loading your config file:')
  console.error(e.toString())
  process.exit(1)
}

const optString = s.String({ opt: true })

const configSchema = s.Object({
  org: s.String(),
  token: s.String({ opt: true }),
  repositories: s.Object({ opt: true }, {
    exclude: s.Array({ opt: true }, [ s.String() ])
  }),
  step: s.Object({ strict: false }, {
    type: s.String(),
    name: optString,
    command: optString,
    artifact_paths: optString,
    branch_configuration: optString,
    env: s.Object({ opt: true, strict: false }),
    timeout_in_minutes: s.Number({ opt: true }),
    agent_query_rules: s.Array({ opt: true }, [ s.String() ])
  })
})

try {
  config = configSchema.validate(config)
} catch (e) {
  console.error('Oops, invalid config!')
  console.error(e.toString())
  process.exit(1)
}

if (!config.token) {
  if (!process.env.BUILDKITE_TOKEN) {
    console.error('Cannot find buildkite token, either set it in your config file, or set BUILDKITE_TOKEN')
    process.exit(1)
  }
  config.token = process.env.BUILDKITE_TOKEN
}

let {
  org,
  token,
  repositories = {},
  step
} = config

if (!repositories.exclude) repositories.exclude = []

const buildnode = Buildnode({
  accessToken: token
})

buildnode.getOrganization(org, function (err, org) {
  if (err) {
    throw err
  }

  org.listPipelines(function (err, pipelines) {
    if (err) {
      throw err
    }

    if (!pipelines) {
      console.error('Error fetching pipelines...')
      process.exit(1)
    }

    pipelines = pipelines.filter((p) => !~repositories.exclude.indexOf(p.slug))

    determineChanges(pipelines)
  })
})

function determineChanges (pipelines) {
  let changes = {}
  pipelines.forEach(function (pipeline) {
    let initialStep = pipeline.data.steps[0]
    for (let k in step) {
      if (!equal(initialStep[k], step[k])) {
        if (!changes[pipeline.slug]) {
          changes[pipeline.slug] = []
        }
        changes[pipeline.slug].push({
          key: k,
          old: initialStep[k] || 'Not Set',
          new: step[k]
        })
      }
    }
    for (let k in initialStep) {
      if (step[k] === undefined) {
        step[k] = initialStep[k]
      }
    }
  })
  if (Object.keys(changes).length === 0) {
    console.log('No changes!'.green)
    process.exit()
  }
  promptChanges(pipelines, changes)
}

function promptChanges (pipelines, changes) {
  let questions = []

  for (let pipelineName in changes) {
    questions.push({
      type: 'confirm',
      name: pipelineName,
      message: getStepDiffMsg(pipelineName, changes[pipelineName])
    })
  }

  inquirer.prompt(questions).then(function (answers) {
    for (let name in answers) {
      if (answers[name] !== true) {
        delete changes[name]
      }
    }
    doChanges(pipelines, changes)
  })
}

function doChanges (pipelines, changes) {
  let _pipelines = {}
  for (let i = 0; i < pipelines.length; i++) {
    _pipelines[pipelines[i].slug] = pipelines[i]
  }
  let errs = []
  async.each(Object.keys(changes), function (pipelineName, done) {
    let pipeline = _pipelines[pipelineName]
    pipeline.update({
      steps: [ step ]
    }, function (err) {
      if (err) {
        errs.push({
          pipelineName,
          err
        })
        console.error(`✘ ${pipelineName}`.red)
        return done()
      }
      console.log(`✓ ${pipelineName}`.green)
      return done()
    })
  }, function () {
    if (errs.length) {
      errs.forEach(function (e) {
        console.error(`Error updating ${e.pipelineName}:`)
        console.error(`  ${e.err.toString()}`)
      })
    } else {
      console.log('All done!'.green)
    }
  })
}

function getStepDiffMsg (pipelineName, changes) {
  let t = changes.map(function (change) {
    return [
      `  ${change.key}:`,
      '    Old: ' + change.old.red,
      '    New: ' + change.new.green
    ].join('\n')
  })
  t.unshift(`${pipelineName} changes:`)
  t.unshift('')
  t.push(`There are changes to ${pipelineName}, do you wish to update it?`)
  return t.join('\n')
}
