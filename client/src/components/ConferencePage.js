import React, { useState, useEffect } from "react";
import io from "socket.io-client";
import { Device } from "mediasoup-client";

const SERVER_URL = "http://localhost:3000";

const ConferencePage = ({ roomId }) => {
  const [socket, setSocket] = useState(null);
  const [device, setDevice] = useState(null);
  const [routerRtpCapabilities, setRouterRtpCapabilities] = useState(null);
  const [sendTransport, setSendTransport] = useState(null);
  const [userList, setUserList] = useState([]);
  // const [recvTransport, setRecvTransport] = useState(null);
  let recvTransport = null;
  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);
    console.log("Client rooms: ", newSocket.rooms);
    newSocket.on("connect", () => {
      console.log("Connected to server:", newSocket.id);

      newSocket.emit("joinRoom", roomId, (response) => {
        if (response.error) {
          console.error("Error joining room:", response.error);
          return;
        }
        console.log(
          "Router RTP Capabilities received:",
          response.routerRtpCapabilities
        );
        setRouterRtpCapabilities(response.routerRtpCapabilities);
      });
    });

    newSocket.on("updateUserList", (newUserList) => {
      console.log("Received Updated User List:", newUserList);
      setUserList(newUserList);
    });
    debugger;
    newSocket.on("newProducer", async ({ producerId, userId }) => {
      console.log(`New producer detected: ${producerId} from user ${userId}`);
      await createRecvTransport();
      await consumeMedia(producerId);
    });

    return () => newSocket.close();
  }, [roomId]);

  const initDevice = async () => {
    if (!routerRtpCapabilities) {
      console.warn("Router RTP Capabilities not available");
      return;
    }

    try {
      const mediasoupDevice = new Device();
      await mediasoupDevice.load({ routerRtpCapabilities });
      setDevice(mediasoupDevice);
      console.log("Mediasoup Device Initialized");
    } catch (error) {
      console.error("Error initializing Mediasoup device:", error);
    }
  };

  const createSendTransport = () => {
    if (!device) {
      console.warn("Device not initialized");
      return;
    }

    socket.emit("createTransport", (transportOptions) => {
      if (!transportOptions || transportOptions.error) {
        console.error(
          "Error creating transport:",
          transportOptions?.error || "No options received"
        );
        return;
      }

      const transport = device.createSendTransport(transportOptions);

      transport.on("connect", ({ dtlsParameters }, callback, errback) => {
        socket.emit("connectTransport", { dtlsParameters }, (err) => {
          if (err) {
            console.error("Transport connect error:", err);
            return errback(err);
          }
          callback();
        });
      });

      transport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
        socket.emit("produce", { kind, rtpParameters }, ({ id, error }) => {
          if (error) {
            console.error("Produce error:", error);
            return errback(error);
          }
          callback({ id });
        });
      });

      setSendTransport(transport);
      console.log("Send Transport Created");
    });
  };

  const produceMedia = async () => {
    if (!sendTransport) {
      console.warn("Send Transport not available");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      console.log("Video Track:", videoTrack);
      console.log("Track Ready State:", videoTrack.readyState); // Should be "live"
      console.log("Track Muted:", videoTrack.muted); // Should be false

      if (videoTrack) {
        const videoElement = document.createElement("video");
        videoElement.srcObject = stream;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        document.body.appendChild(videoElement);
      }

      // Produce video track
      if (!videoTrack || !audioTrack) {
        console.error("Video or audio track is missing. Exiting function.");
        return;
      }

      console.log("Tracks obtained. Producing video...");
      const videoProducer = await sendTransport.produce({ track: videoTrack });
      console.log("Video Producer created:", videoProducer.id);
      console.log("Video Producer created:", videoProducer.id);

      const audioProducer = await sendTransport.produce({
        track: audioTrack,
      });

      const producerId = videoProducer.id; // Obtain the producerId from the producer

      await createRecvTransport();
      await consumeMedia(producerId); // Pass the producerId to consume the media
      // Produce audio track

      console.log("Audio Producer created:", audioProducer.id);
    } catch (error) {
      console.error("Error producing media:", error);
    }
  };

  const createRecvTransport = async () => {
    debugger;
    if (!device) {
      debugger
      console.log("device is not initialized");
      return;
    }

    const transportOptions = await new Promise((resolve) =>
      socket.emit("createTransport", resolve)
    );

    recvTransport = device.createRecvTransport(transportOptions);

    recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
      console.log("Connecting recvTransport...");
      socket.emit("connectTransport", { dtlsParameters }, (err) => {
        if (err) {
          errback(err);
        } else {
          debugger;
          callback();
        }
      });
    });

    console.log("Receive transport created:", recvTransport);
  };

  const consumeMedia = async (producerId) => {
    try {
      debugger;
      // Request the server to create a consumer
      console.log("Receive transport createdfffffffffffffff :", recvTransport);
      const { id, kind, rtpParameters, error } = await new Promise((resolve) =>
        socket.emit(
          "consume",
          { producerId, rtpCapabilities: device.rtpCapabilities },
          resolve
        )
      );

      if (error) {
        console.error("Error consuming mediahhh  :", error);
        return;
      }

      // Create the consumer on the client
      const consumer = await recvTransport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
      });
      console.log("Consumer:", consumer);
      console.log("Consumer Track:", consumer.track);

      // Get the track and attach it to a media element
      console.log(`Consumer created on client: ${consumer.id}`);

      const stream = new MediaStream();
      console.log("MediaStream:", stream);
      console.log("Video Tracks:", stream.getVideoTracks());
      console.log("Audio Tracks:", stream.getAudioTracks());

      stream.addTrack(consumer.track);
      console.log("MediaStream:", stream);
      console.log("Tracks:", stream.getTracks());
      console.log("Video Tracks:", stream.getVideoTracks());

      if (kind === "video") {
        const videoElement = document.createElement("video");
        videoElement.srcObject = stream;
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.style.width = "640px"; // Set desired width
        videoElement.style.height = "360px"; // Set desired height

        // Optional: Add additional styles for positioning or layout
        videoElement.style.border = "1px solid #ccc";
        videoElement.style.margin = "10px";

        console.log("Adding Video Element to DOM:", videoElement);
        console.log("Video element added:", videoElement);
        console.log("Video Stream:", videoElement.srcObject);

        videoElement
          .play()
          .then(() => console.log("Video playback started"))
          .catch((err) => console.error("Autoplay Error:", err));

        document.body.appendChild(videoElement);
        // Verify after appending
        console.log(
          "Video Element in DOM after append:",
          document.querySelector("video")
        );
      } else if (kind === "audio") {
        const audioElement = document.createElement("audio");
        audioElement.srcObject = stream;
        audioElement.autoplay = true;
        document.body.appendChild(audioElement);
      }

      // Resume the consumer after creating it
      await consumer.resume();
    } catch (error) {
      console.error("Error consuming media:", error);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h1>Room: {roomId}</h1>
      <button onClick={initDevice} disabled={!routerRtpCapabilities}>
        Initialize Device
      </button>
      <button onClick={createSendTransport} disabled={!device}>
        Create Send Transport
      </button>
      <button onClick={produceMedia} disabled={!sendTransport}>
        Start Producing Media
      </button>
      {/* <button onClick={createRecvTransport} disabled={!device}>
        receive Send Transport
      </button> */}
      {/* <button onClick={consumeMedia} disabled={!createRecvTransport}>
        Start reciving Media
      </button> */}
      <div style={{ padding: "20px" }}>
        <h1>Room: {roomId}</h1>
        <h3>Participants:</h3>
        <ul>
          {userList.map((user) => (
            <li key={user.id}>{user.id === socket?.id ? "You" : user.id}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ConferencePage;
