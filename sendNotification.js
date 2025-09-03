const admin = require("firebase-admin");

// 1) Credenciales desde secreto (NO archivo)
//    En GitHub Actions guardaremos el JSON completo en FIREBASE_SERVICE_ACCOUNT
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error("Falta el secreto FIREBASE_SERVICE_ACCOUNT");
  process.exit(1);
}
const serviceAccount = JSON.parse(serviceAccountJson);

// 2) Inicializar Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  // databaseURL no es necesario para Firestore/FCM
});

const db = admin.firestore();
const messaging = admin.messaging();

async function getNextNotification() {
  // Busca la primera activa por orden 'seq'
  const snap = await db.collection("notifications")
    .where("active", "==", true)
    .orderBy("seq")
    .limit(1)
    .get();

  if (snap.empty) {
    console.log("No hay activas. Reactivando todas...");
    const all = await db.collection("notifications").get();
    const batch = db.batch();
    all.forEach(doc => batch.update(doc.ref, { active: true }));
    await batch.commit();
    // Volver a intentar una vez reactivadas
    return getNextNotification();
  }

  return snap.docs[0];
}

async function main() {
  // 3) Obtener siguiente notificación
  const notifDoc = await getNextNotification();
  const notif = notifDoc.data();

  const title = notif.title || "Temipu";
  const body = notif.body || "";

  // 4) Enviar a topic 'general'
  await messaging.sendToTopic("general", {
    notification: { title, body },
  });

  console.log(`✅ Enviada: [seq=${notif.seq}] ${title}`);

  // 5) Marcar como usada (para no repetir hasta ciclo completo)
  await notifDoc.ref.update({ active: false, lastSentAt: admin.firestore.FieldValue.serverTimestamp() });
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("❌ Error enviando notificación:", err);
    process.exit(1);
  });
