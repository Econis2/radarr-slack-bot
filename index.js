const express = require('express')
const bodyParser = require('body-parser')
const radarr = require('./radarr/index')

const port = process.env.PORT || 8081
const app = express()

app.use(bodyParser.urlencoded({extended: true}))
app.use(bodyParser.json())

app.use('/api/radarr', radarr)

app.listen(port, () => {
    console.log("App listenting on port " + port)
})