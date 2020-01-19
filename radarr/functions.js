const crypto = require('crypto')
const qs = require('qs')
const axios = require('axios')
const secrets = require('../secrets')


module.exports = {

    session: {},

    radar_config: {
        url: secrets.RADARR_URI,
        api_key: secrets.API_KEY
    },

    slack_secret: secrets.SLACK_SECRET,

    slackVerification (req, res, next) {
        let slackSig = req.headers['x-slack-signature']
        let reqBody = qs.stringify(req.body, { format: 'RFC1738'})
        let timeStamp = req.headers['x-slack-request-timestamp']

        if( !slackSig || !timeStamp){
            return res.status(400).send()
        }

        // Now in Seconds
        const time = Math.floor(new Date().getTime()/1000)
        // Check for time Delay
        if( Math.abs(time - timeStamp) > 300){
            return res.status(401).send()
        }

        let sigBaseString = 'v0:' + timeStamp + ":" + reqBody

        let sig = 'v0=' + crypto.createHmac('sha256', module.exports.slack_secret)
                            .update(sigBaseString, 'utf8')
                            .digest('hex')

        if( 
            crypto.timingSafeEqual( 
                Buffer.from(sig, 'utf8'),
                Buffer.from(slackSig, 'utf8')
            )
        ){
            let session = {
                index: 0,
                data: []
            }

            module.exports.session[req.body.user_id] = session
            return next()
        }
        else {
            return res.status(401).send()
        }
    },

    slackMovieMessageBuilder (movie) {
        // let movie = {
        //     id: id,
        //     title: string,
        //     image_url: string
        // }

        let m_title = {
            type: "section",
            text: {
                type: "mrkdwn",
                text: "*" + movie.title + "*"
            }
        }

        let cover = {
            type: "image",
            image_url: movie.image_url,
            alt_text: movie.title
        }

        let actionBtns = []

        let btn_prev = {
            type: "button",
            text: {
                type: "plain_text",
                text: "PREVIOUS"
            },
            action_id: "prev",
        }

        let btn_cancel = {
            type: "button",
            text: {
                type: "plain_text",
                text: "CANCEL"
            },
            style: "danger",
            action_id: "cancel",
        }

        let btn_select = {
            type: "button",
            text: {
                type: "plain_text",
                text: "SELECT"
            },
            style: "primary",
            action_id: "select",
        }

        let btn_next = {
            type: "button",
            text: {
                type: "plain_text",
                text: "NEXT"
            },
            action_id: "next",
        }

        if(movie.add){
            if(movie.add.indexOf('prev') != -1){
                actionBtns.push(btn_prev)
            }
        }


        actionBtns.push(btn_cancel)

        actionBtns.push(btn_select)

        if(movie.add){
            if(movie.add.indexOf('next') != -1){
                actionBtns.push(btn_next)
            }
        }

        let actions = {
            type: "actions",
            elements: actionBtns
        }

        let movieMessage = {
            blocks: [
                m_title,
                cover,
                actions
            ]
        }

        return movieMessage
    },

    removeSession (id){
        module.exports.session[id] = {}
    },

    async slashRadarr (req, res){

        let r = await module.exports.getMovies(req.body)

        if(r == 200){
            let uId = req.body.user_id
            let data = module.exports.session[uId].data
            let movie = ""

            if(data.length){
                movie = data[0]
            }
            else{
                movie = data
            }

            let movieMessage = module.exports.slackMovieMessageBuilder(movie)

            return res.status(200).json(movieMessage)
        }
        else{
            console.log("slashRadarr 500")
            return res.status(500).send()
        }
    },

    requestGenerator (body){
        let request = {
            url: module.exports.radar_config.url + '/api/movie/lookup',
            method: "GET",
            params: {
                apiKey: module.exports.radar_config.api_key
            }

        }

        let textArr = body.text.split(' ')
        let type = textArr[0]
        
        if(type == "title"){
            request.params['term'] = encodeURI(textArr.slice(1,textArr.length).join(' '))
            return request
        }
        else if(type == "tmdb" || type == "imdb"){
            request.url = request.url + '/' + type
            request.params[type + "Id"] = textArr[1]
            return request
        }
        else{
            return
        }

    },

    async getMovies (body) {

            let request = module.exports.requestGenerator(body)
            if(request){
                
                let result = await axios(request)
                
                if(result.data.length){                
                    
                    let final = []

                    for (let x = 0; x < result.data.length; x++) {
                        const movie = result.data[x];
                        let add = []
        
                        if(x == 0){
                            add.push("next")
                        }
                        if(x == result.data.length -1){
                            add.push("prev")
                        }
                        else if(x != 0 && x != result.data.length -1){
                            add.push("prev")
                            add.push("next")
                        }

                        let full = movie
                        full.profileId = 6
                        full['isExisting'] = false
                        full['saved'] = false
                        full['deleted'] = false
                        full['rootFolderPath'] = '/home/movies/'
                        full['monitored'] = true
                        full['epsiodeCount'] = 0
                        full['episodeFileCount'] = 0
                        full['addOptions'] = {
                            searchForMovie: true,
                            ignoreEpisodesWithFiles: false,
                            ignoreEpisodesWithoutFiles: false
                        }
        
                        final.push({
                            id: movie.tmdbId,
                            title: movie.title,
                            image_url: movie.remotePoster,
                            full: full,
                            add: add
                        })
                        
                    }
        
                    module.exports.session[body.user_id]['data'] = final
        
                    return 200
                }
                else{
                    if(result.data.title){
                        let movie = result.data
                        let full = movie
                        full.profileId = 6
                        full['isExisting'] = false
                        full['saved'] = false
                        full['deleted'] = false
                        full['rootFolderPath'] = '/home/movies/'
                        full['monitored'] = true
                        full['epsiodeCount'] = 0
                        full['episodeFileCount'] = 0
                        full['addOptions'] = {
                            searchForMovie: true,
                            ignoreEpisodesWithFiles: false,
                            ignoreEpisodesWithoutFiles: false
                        }

                        module.exports.session[body.user_id]['data'] = {
                            id: movie.tmdbId,
                            title: movie.title,
                            image_url: movie.images[0].url,
                            full: full
                        }

                        return 200
                    }
                    else{
                        return 404
                    }
                    
                }

                

            }

    },

    routeCommand (req, res){
        let action_id = JSON.parse(req.body.payload).actions[0].action_id

        if(action_id == "cancel" ){
            return module.exports.cancel_request(req, res)
        }
        else if(action_id == "select" ){
            return module.exports.select_movie(req, res)
        }
        else if(action_id == "next" ){
            return module.exports.next_movie(req, res)
        }
        else if(action_id == "prev" ){
            return module.exports.prev_movie(req, res)
        }
        else{
            return res.status(500).send()
        }
    },

    async next_movie (req, res){
        let payload = JSON.parse(req.body.payload)
        try{
            let c_session = module.exports.session[payload.user.id]
            c_session.index ++
        
            let message = module.exports.slackMovieMessageBuilder(c_session.data[c_session.index])
            message['replace_original'] = true
            
            await axios({
                url: payload.response_url,
                method: "POST",
                data: message
            })
    
            return res.status(200).send()
        }
        catch {
            return res.status(500).send()
        }
    },

    async prev_movie (req, res) {
        let payload = JSON.parse(req.body.payload)
        try{
            let c_session = module.exports.session[payload.user.id]
            c_session.index = c_session.index -1
        
            let message = module.exports.slackMovieMessageBuilder(c_session.data[c_session.index])
            message['replace_original'] = true
            
            await axios({
                url: payload.response_url,
                method: "POST",
                data: message
            })
    
            return res.status(200).send()
        }
        catch {
            return res.status(500).send()
        }
    },

    async cancel_request (req, res){
        let payload = JSON.parse(req.body.payload)
        try{
            module.exports.removeSession(payload.user.id)

            await axios({
                url: payload.response_url,
                method: "POST",
                data: {
                    "response_type": "ephemeral",
                    "replace_original": true,
                    "delete_original": true,
                    "text": ""
                }
            })

            return res.status(200).send()
        }
        catch{
            return res.status(500).send()
        }
    },

    async select_movie (req, res){
        let payload = JSON.parse(req.body.payload)
        let session = module.exports.session[payload.user.id]

        let movie = session.data[session.index].full
        try{
            let r = await axios({
            url: module.exports.radar_config.url + '/api/movie',
            method: 'POST',
            headers: {
                'X-Api-Key': module.exports.radar_config.api_key,
                'content-type': "application/json"
            },
            data: movie
            })

            let r2 = await axios({
                url: payload.response_url,
                method: "POST",
                data: {
                    "response_type": "ephemeral",
                    "replace_original": true,
                    "delete_original": true,
                    "text": ""
                }
            })

        }
        catch (err){
            console.log(err.response.status)
        }



    }   


}
