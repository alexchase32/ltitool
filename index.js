const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const LTI_KEY = 'amada';
const LTI_SECRET = 'enemiga';
const LTI_VERSION = 'LTI-1p0';

// Function to validate LTI launch request
const validateLtiRequest = (req) => {
    const oauth_consumer_key = req.body.oauth_consumer_key;
    const oauth_signature = req.body.oauth_signature;
    // Add more validations as needed
    return oauth_consumer_key === LTI_KEY && oauth_signature;
};

function generateOAuthSignature(method, url, parameters, consumerSecret) {
    // Sort parameters alphabetically
    const sortedParams = Object.keys(parameters).sort().reduce((acc, key) => {
        acc[key] = parameters[key];
        return acc;
    }, {});

    // Normalize parameters
    const normalizedParams = Object.entries(sortedParams).map(([key, value]) => {
        return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }).join('&');

    // Generate signature base string
    const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(normalizedParams)}`;

    // Generate signing key
    const signingKey = `${encodeURIComponent(consumerSecret)}&`;

    // Generate signature
    const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

    return signature;
}

// Example usage
const method = 'POST';
const url = 'lti.spanishg.com/lti';
const parameters = {
    oauth_consumer_key: 'amada',
    oauth_nonce: 'random_nonce',
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: '1.0'
};
const consumerSecret = 'dosamantes';

const signature = generateOAuthSignature(method, url, parameters, consumerSecret);
console.log('OAuth Signature:', signature);


// Handle LTI launch request
app.post('/lti', (req, res) => {
    if (!validateLtiRequest(req)) {
        return res.status(401).send('Invalid LTI request');
    }
    // Extract LTI parameters
    const { user_id, roles, context_id, resource_link_id } = req.body;
    // Generate JWT token for content URL
    const token = jwt.sign({ user_id, roles, context_id, resource_link_id }, LTI_SECRET);
    // Redirect to the content URL with JWT token
    res.redirect(`/content?token=${token}`);
});

// Serve content URL
app.get('/content', (req, res) => {
    const token = req.query.token;
    try {
        const payload = jwt.verify(token, LTI_SECRET);
        // Serve the learning activity based on the payload
        res.send(`<html><body><h1>Welcome ${payload.user_id}</h1><p>Content for ${payload.resource_link_id}</p></body></html>`);
    } catch (error) {
        res.status(401).send('Invalid token');
    }
});

// Handle score passback
app.post('/score', async (req, res) => {
    const { user_id, score, lis_result_sourcedid, lis_outcome_service_url } = req.body;
    const xml = `
        <imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">
            <imsx_POXHeader>
                <imsx_POXRequestHeaderInfo>
                    <imsx_version>V1.0</imsx_version>
                    <imsx_messageIdentifier>${crypto.randomBytes(16).toString('hex')}</imsx_messageIdentifier>
                </imsx_POXRequestHeaderInfo>
            </imsx_POXHeader>
            <imsx_POXBody>
                <replaceResultRequest>
                    <resultRecord>
                        <sourcedGUID>
                            <sourcedId>${lis_result_sourcedid}</sourcedId>
                        </sourcedGUID>
                        <result>
                            <resultScore>
                                <language>en</language>
                                <textString>${score}</textString>
                            </resultScore>
                        </result>
                    </resultRecord>
                </replaceResultRequest>
            </imsx_POXBody>
        </imsx_POXEnvelopeRequest>
    `;
    try {
        const response = await axios.post(lis_outcome_service_url, xml, {
            headers: { 'Content-Type': 'application/xml' },
        });
        res.send(response.data);
    } catch (error) {
        res.status(500).send('Error in score passback');
    }
});

app.listen(port, () => {
    console.log(`LTI tool server running on port ${port}`);
});
