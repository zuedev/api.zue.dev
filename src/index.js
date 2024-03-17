import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import SpotifyWebAPI from "spotify-web-api-node";

const db = await dbSetup();

const app = express();
app.use(
  cors({
    // allow all origins
    origin: "*",
  })
);

app.get("/", (request, response) => {
  return response.send({
    uuid: uuid(),
    message: "Hello World",
  });
});

app.get("/zuedev/spotify", async (request, response) => {
  try {
    const spotify = await spotifyLogin({ request, response });

    // catch the redirect
    if (!spotify) return;

    // catch the wrong account
    if (spotify === 2)
      return response.send({
        uuid: uuid(),
        playing: false,
        error: "Wrong account",
      });

    const playbackState = await spotify.getMyCurrentPlaybackState();

    if (playbackState.body.is_playing) {
      const currentlyPlaying = await spotify.getMyCurrentPlayingTrack();

      return response.send({
        uuid: uuid(),
        playing: true,
        id: currentlyPlaying.body.item.id,
        artist: currentlyPlaying.body.item.artists[0].name,
        track: currentlyPlaying.body.item.name,
      });
    }
  } catch (error) {
    console.log(error);
  }

  return response.send({
    uuid: uuid(),
    playing: false,
  });
});

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

function uuid() {
  return "x".repeat(64).replace(/x/g, () => {
    return ((Math.random() * 16) | 0).toString(16);
  });
}

async function dbSetup() {
  // does data/ exist?
  if (!fs.existsSync("data")) fs.mkdirSync("data");

  const adapter = new JSONFile("data/db.json");
  const db = new Low(adapter);

  await db.read();

  db.data = db.data || {};
  db.write();

  return db;
}

async function spotifyLogin({ request, response }) {
  const agent = new SpotifyWebAPI({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
  });

  // does the db have our creds?
  if (
    db.data.spotify?.accessToken &&
    db.data.spotify?.refreshToken &&
    db.data.spotify?.expiry
  ) {
    // creds look good, but is the access token expired?
    if (db.data.spotify.expiry < new Date().getTime()) {
      // access token is expired, so we need to refresh it
      agent.setRefreshToken(db.data.spotify.refreshToken);

      const data = await agent.refreshAccessToken();

      // update the db with new creds
      db.data.spotify = {
        accessToken: data.body.access_token,
        refreshToken: db.data.spotify.refreshToken,
        expiry: new Date().getTime() + data.body.expires_in * 1000,
      };

      await db.write();
    }

    // creds are good, so set them on the agent and return it
    agent.setAccessToken(db.data.spotify.accessToken);
    agent.setRefreshToken(db.data.spotify.refreshToken);

    return agent;
  } else {
    // creds missing, so we need to get them
    // do we have a code?
    if (request.query.code) {
      const data = await agent.authorizationCodeGrant(request.query.code);

      // check we got the right account
      const tempAgent = new SpotifyWebAPI({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIFY_REDIRECT_URI,
      });

      tempAgent.setAccessToken(data.body.access_token);
      tempAgent.setRefreshToken(data.body.refresh_token);

      const me = await tempAgent.getMe();

      if (me.body.id !== "5887963") return 2;

      db.data.spotify = {
        accessToken: data.body.access_token,
        refreshToken: data.body.refresh_token,
        expiry: new Date().getTime() + data.body.expires_in * 1000,
      };

      await db.write();

      agent.setAccessToken(db.data.spotify.accessToken);
      agent.setRefreshToken(db.data.spotify.refreshToken);

      return agent;
    }

    // no code, so we need to get one
    const scopes = ["user-read-playback-state", "user-read-currently-playing"];
    const authorizeURL = agent.createAuthorizeURL(scopes);

    await response.redirect(authorizeURL);

    return false;
  }
}
