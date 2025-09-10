import React, { useEffect, useState, useRef } from "react";
import { View, Text, FlatList, SafeAreaView, TouchableOpacity, Linking } from "react-native";
import io from "socket.io-client";
import * as Notifications from "expo-notifications";
import * as Device from 'expo-device';

Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }) });

const BACKEND_URL = "https://YOUR_SERVER_URL_HERE"; // replace with your server or ngrok

export default function App() {
  const [events, setEvents] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => { console.log("Push token (Expo):", token); });

    const socket = io(BACKEND_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => console.log("connected to backend"));
    socket.on("news_event", (evt) => {
      setEvents(prev => [{ id: Date.now()+Math.random(), type: "news", ...evt }, ...prev].slice(0,200));
    });
    socket.on("trade_alert", (alert) => {
      setEvents(prev => [{ id: Date.now()+Math.random(), type: "alert", ...alert }, ...prev].slice(0,200));
      Notifications.scheduleNotificationAsync({
        content: { title: `${alert.action} ${alert.tickers.join(", ")}`, body: alert.title.slice(0,120), data: { alert: JSON.stringify(alert) } },
        trigger: null
      });
    });

    return () => socket.disconnect();
  }, []);

  function renderItem({ item }) {
    return (
      <TouchableOpacity onPress={() => item.url && Linking.openURL(item.url)}>
        <View style={{ padding: 10, borderBottomWidth: 1, borderColor: "#eee" }}>
          <Text style={{fontWeight: "bold"}}>{item.type === "alert" ? (item.action + " • " + item.tickers.join(",")) : (item.source)}</Text>
          <Text>{item.title || item.event?.title}</Text>
          <Text style={{color: item.sentiment?.score > 0.4 ? "green" : item.sentiment?.score < -0.4 ? "red" : "gray"}}>Sentiment: {item.sentiment?.score?.toFixed(2)}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={{flex:1}}>
      <FlatList data={events} keyExtractor={i=>String(i.id)} renderItem={renderItem} />
    </SafeAreaView>
  );
}

async function registerForPushNotificationsAsync() {
  let token;
  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      alert('Failed to get push token for push notifications!');
      return;
    }
    token = (await Notifications.getExpoPushTokenAsync()).data;
  } else {
    alert('Must use physical device for Push Notifications');
  }
  return token;
}
