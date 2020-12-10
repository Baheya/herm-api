const fetch = require('node-fetch');
const Twitter = require('twitter-lite');
const crypto = require('crypto');

module.exports = async function (context, req) {
  try {
    const { headers, payload } = req.body;
    const keys = await getAccessKeys(payload.user_id, context);
    const client = new Twitter({
      consumer_key: process.env.CONSUMER_API_KEY,
      consumer_secret: process.env.CONSUMER_API_SECRET,
      access_token_key: keys.access_token_key,
      access_token_secret: keys.access_token_secret,
    });
    context.log(client);
    const tweet = await client.post('statuses/update', {
      status: req.body.payload.text,
    });

    await updatePostStatus(payload.id);
    context.res = {
      headers: { 'Content-Type': 'application/json' },
      body: tweet,
    };
  } catch (error) {
    context.res = {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
      body: error,
    };
    return;
  }
};

const getAccessKeys = async (userId) => {
  const query = `
  {
    account_user(where: {user_id: {_eq: ${userId}}}) {
      account {
        access_token
        access_token_secret
      }
    }
  }
  `;

  const res = await makeRequest(`${process.env.GRAPHQL_BASE_API}/v1/graphql`, {
    query,
  });
  const { account_user } = res.data;
  const {
    account: { access_token, access_token_secret },
  } = account_user[0];

  const decryptedAccessKey = decryptToken(access_token);
  const decryptedAccessSecret = decryptToken(access_token_secret);

  return {
    access_token_key: decryptedAccessKey,
    access_token_secret: decryptedAccessSecret,
  };
};

function decryptToken(token) {
  const password = `${process.env.CRYPTO_PASSWORD}`;
  const algorithm = `${process.env.CRYPTO_ALGO}`;

  var decipher = crypto.createDecipher(algorithm, password);
  var decrypted = decipher.update(token, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const makeRequest = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'x-hasura-admin-secret': process.env.HASURA_GRAPHQL_ADMIN_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return res.json();
};

const updatePostStatus = async (postId) => {
  const query = `
  mutation {
    update_scheduled_post_by_pk(pk_columns: {id: ${postId}}, _set: {is_pending: false}) {
      is_pending
    }
  }
  `;
  return await makeRequest(`${process.env.GRAPHQL_BASE_API}/v1/graphql`, {
    query,
  });
};
