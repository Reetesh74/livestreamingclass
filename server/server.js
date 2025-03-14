const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mediasoup = require("mediasoup");
const { v4: uuidv4 } = require("uuid");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: "http://localhost:3001", // Allow the client from this origin
    methods: ["GET", "POST"], // Define allowed HTTP methods
    allowedHeaders: ["Content-Type"], // Allow Content-Type header in requests
  })
);

// Your existing code for socket.io
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3001", // Ensure it's consistent here
    methods: ["GET", "POST"],
  },
});

app.post("/createMeeting", (req, res) => {
  const roomId = uuidv4(); // Generate a unique meeting ID
  peers[roomId] = []; // Initialize the room with no peers
  console.log(`Meeting created with ID: ${roomId}`);
  res.json({ roomId }); // Send the meeting ID to the client
});

const mediasoupWorkers = [];
let router;

const peers = {};
const users = {};

(async () => {
  try {
    const worker = await mediasoup.createWorker();
    mediasoupWorkers.push(worker);

    router = await worker.createRouter({
      mediaCodecs: [
        {
          kind: "audio",
          mimeType: "audio/opus",
          clockRate: 48000,
          channels: 2,
        },
        {
          kind: "video",
          mimeType: "video/VP8",
          clockRate: 90000,
          parameters: {
            "x-google-start-bitrate": 1000,
          },
        },
      ],
    });

    console.log("Mediasoup worker and router created.");
  } catch (error) {
    console.error("Error initializing Mediasoup worker/router:", error);
  }
})();

io.on("connection", (socket) => {
  console.log(`New client connected: ${socket.id}`);

  users[socket.id] = { id: socket.id, roomId: null };

  socket.on("joinRoom", async (roomId, callback) => {
    console.log(`${socket.id} is joining room: ${roomId}`);

    users[socket.id].roomId = roomId;

    if (!peers[roomId]) peers[roomId] = [];
    peers[roomId].push(socket.id);

    socket.join(roomId);
    const userList = peers[roomId].map((id) => ({ id }));
    console.log("user updated list " + JSON.stringify(userList));
    io.to(roomId).emit("updateUserList", userList);

    // Check if router is ready before sending the capabilities
    if (router && router.rtpCapabilities) {
      console.log("Sending router RTP capabilities");
      callback({ routerRtpCapabilities: router.rtpCapabilities });
    } else {
      console.error("Router not initialized yet");
      callback({ error: "Router not ready" });
    }
  });

  // Handle client request to create transport
  socket.on("createTransport", async (callback) => {
    try {
      if (!router) {
        return callback({ error: "Router is not ready" });
      }

      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: "0.0.0.0", announcedIp: null }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      });

      socket.transport = transport;
    } catch (error) {
      console.error("Error creating transport:", error);
      callback({ error: "Transport creation failed" });
    }
  });

  

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);

    const roomId = users[socket.id]?.roomId;
    if (roomId && peers[roomId]) {
      peers[roomId] = peers[roomId].filter((id) => id !== socket.id);
      const userList = peers[roomId].map((id) => ({ id }));

      io.to(roomId).emit("updateUserList", userList);

      if (peers[roomId].length === 0) {
        delete peers[roomId];
      }
    }

    delete users[socket.id];
  });
});

server.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
