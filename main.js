
      import {
        createLightNode,
        waitForRemotePeer,
        createEncoder,
        createDecoder,
        utf8ToBytes,
        bytesToUtf8,
      } from "https://unpkg.com/@waku/sdk@0.0.20/bundle/index.js";
      import {
        enrTree,
        DnsNodeDiscovery,
      } from "https://unpkg.com/@waku/dns-discovery@0.0.16/bundle/index.js";
      import { messageHash } from "https://unpkg.com/@waku/message-hash@0.1.8/bundle/index.js";

      const peerIdDiv = document.getElementById("peer-id");
      const remotePeerIdDiv = document.getElementById("remote-peer-id");
      const statusDiv = document.getElementById("status");
      const remoteMultiAddrDiv = document.getElementById("remote-multiaddr");
      const dialButton = document.getElementById("dial");
      const subscribeButton = document.getElementById("subscribe");
      const unsubscribeButton = document.getElementById("unsubscribe");
      const queryStoreButton = document.getElementById("queryStoreButton");
      const messagesDiv = document.getElementById("messages");
      const textInput = document.getElementById("textInput");
      const sendButton = document.getElementById("sendButton");
      const getPeersButton = document.getElementById("getPeersButton");
      const peersSelector = document.getElementById("peer-select");
      const sender = document.getElementById("sender");
      const receiver = document.getElementById("receiver");

      const ContentTopic = "/waku/se/chat/";
      // Each key is a unique identifier for the message. Each value is an obj { text, timestamp }
      let messages = {};
      let unsubscribe;

      const updateMessages = (msgs, div) => {
        div.innerHTML = "<ul>";
        Object.values(msgs)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
          .forEach(
            (msg) =>
              (div.innerHTML +=
                "<li>" + `${msg.text} - ${msg.timestamp}` + "</li>")
          );
        div.innerHTML += "</ul>";
      };

      try {
        await getPeers();
      } catch (e) {
        console.log("Failed to find a peer", e);
        remoteMultiAddrDiv.value =
          "/dns4/node-01.ac-cn-hongkong-c.wakuv2.test.statusim.net/tcp/8000/wss/p2p/16Uiu2HAkvWiyFsgRhuJEb9JfjYxEkoHLgnUQmr1N5mKWnYjxYRVm";
      }

      statusDiv.innerHTML = "<p>Creating Waku node.</p>";
      const node = await createLightNode();

      statusDiv.innerHTML = "<p>Starting Waku node.</p>";
      await node.start();

      window.waku = node;
      console.info(
        "Use window.waku to access the waku node running in the browser directly through the console."
      );

      // Queries all peers from libp2p peer store and updates list of connected peers
      const updatePeersList = async () => {
        // Generate <p> element with connection string from each peer
        const peers = await node.libp2p.peerStore.all();
        const peerIdElements = peers.map((peer) => {
          const element = document.createElement("p");
          element.textContent = `${peer.addresses[1].multiaddr}/p2p/${peer.id}`;
          return element;
        });
        // Update elements displaying list of peers
        remotePeerIdDiv.replaceChildren(...peerIdElements);
      };

      // Refreshes list of connected peers each time a new one is detected
      node.store.addLibp2pEventListener("peer:connect", async (event) => {
        const peerId = event.detail;
        console.log(`Peer connected with peer id: ${peerId}`);
        // Wait half a second after receiving event for peer to show up in peer store
        setTimeout(async () => {
          updatePeersList();
        }, 500);

        // Update status
        statusDiv.innerHTML = `<p>Peer dialed: ${peerId}</p>`;
        // Enable send and subscribe inputs as we are now connected to a peer
        textInput.disabled = false;
        sendButton.disabled = false;
        subscribeButton.disabled = false;
        queryStoreButton.disabled = false;
      });

      statusDiv.innerHTML = "<p>Waku node started.</p>";
      peerIdDiv.innerHTML = "<p>" + node.libp2p.peerId.toString() + "</p>";
      dialButton.disabled = false;

      dialButton.onclick = async () => {
        const ma = remoteMultiAddrDiv.value;
        if (!ma) {
          statusDiv.innerHTML = "<p>Error: No multiaddr provided.</p>";
          return;
        }
        statusDiv.innerHTML = "<p>Dialing peer.</p>";
        let multiaddr;
        try {
          multiaddr = MultiformatsMultiaddr.multiaddr(ma);
        } catch (err) {
          statusDiv.innerHTML = "<p>Error: invalid multiaddr provided</p>";
          throw err;
        }
        await node.dial(multiaddr, ["filter", "lightpush", "store"]);
      };

      const messageReceivedCallback = (wakuMessage) => {
        // create a unique key for the message
        const msgHash =
          bytesToUtf8(messageHash(ContentTopic, wakuMessage)) +
          wakuMessage.proto.timestamp;
        const text = bytesToUtf8(wakuMessage.payload);
        // store message by its key
        messages[msgHash + wakuMessage.proto.timestamp] = {
          text,
          timestamp: wakuMessage.timestamp,
        };
        // call function to refresh display of messages
        updateMessages(messages, messagesDiv);
      };

      subscribeButton.onclick = async () => {
        unsubscribe = await node.filter.subscribe(
          [await getDecoder()],
          messageReceivedCallback
        );
        unsubscribeButton.disabled = false;
        subscribeButton.disabled = true;
        sender.disabled = true;
      };

      queryStoreButton.onclick = async () => {
        await node.store.queryWithOrderedCallback(
          [await getDecoder()],
          messageReceivedCallback
        );
      };

      unsubscribeButton.onclick = async () => {
        await unsubscribe();
        unsubscribe = undefined;
        unsubscribeButton.disabled = true;
        subscribeButton.disabled = false;
        sender.disabled = false;
      };

      sendButton.onclick = async () => {
        const text = textInput.value;
        
        await node.lightPush.send(await getEncoder(), {
          payload: utf8ToBytes(text),
        });
        console.log("Message sent!");
        textInput.value = null;
      };

      getPeersButton.onclick = async () => {
        await getPeers(statusDiv, remoteMultiAddrDiv);
      };

      peersSelector.addEventListener("change", function (event) {
        remoteMultiAddrDiv.value = event.target.value;
      });

      async function getDecoder() {
        return createDecoder(ContentTopic + sender.value);
      }

      async function getEncoder() {
        return createEncoder({contentTopic: ContentTopic + receiver.value});
      }

      async function getPeers() {
        // Display status
        statusDiv.innerHTML = "<p>Discovering peers</p>";

        // Clear all options in select element
        peersSelector.innerHTML = "";

        // Get peers using DNS discovery
        const defaultNodeCount = 5;
        const dnsDiscovery = await DnsNodeDiscovery.dnsOverHttp();
        const peers = await dnsDiscovery.getPeers([enrTree["TEST"]], {
          relay: defaultNodeCount,
          store: defaultNodeCount,
          filter: defaultNodeCount,
          lightPush: defaultNodeCount,
        });
        console.log(peers);

        // Create an option element for each peer's multiaddr and append to select element
        const optionElements = peers.map((peer) => {
          const optionElement = document.createElement("option");
          optionElement.value = `${peer.multiaddrs[1]}/p2p/${peer.peerId}`;
          optionElement.text = `${peer.multiaddrs[1]}/p2p/${peer.peerId}`;
          return optionElement;
        });
        console.log(optionElements);
        peersSelector.append(...optionElements);

        // Set first peer as selected
        peersSelector.options[0].selected = true;
        remoteMultiAddrDiv.value = peersSelector.options[0].value;

        statusDiv.innerHTML = "<p>Peers discovered</p>";
      }
