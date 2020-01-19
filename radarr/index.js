const routes = require('express').Router()
const functions = require('./functions')

routes.all('/', (req, res, next) => {
    // Check that every request is a valid slack request
    return functions.slackVerification(req, res, next)
})

// Initial Slash Command Comes in through here
routes.post('/', (req, res) => {
    // Initiate the Selection Process
    return functions.slashRadarr(req, res)
    
})

// All Actions Come through Here
routes.post('/command', async (req, res) => {
    return functions.routeCommand(req, res)
})

module.exports = routes