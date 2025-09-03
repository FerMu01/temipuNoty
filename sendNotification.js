const admin = require("firebase-admin");

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountJson) {
  console.error("Falta FIREBASE_SERVICE_ACCOUNT env var");
  process.exit(1);
}
let sa;
try { sa = JSON.parse(serviceAccountJson); } catch (e) {
  console.error("JSON del service account inválido:", e);
  process.exit(1);
}

console.log("Service account project_id:", sa.project_id);
console.log("Service account client_email:", sa.client_email);

admin.initializeApp({
  credential: admin.credential.cert(sa),
});

const db = admin.firestore();
const messaging = admin.messaging();
const TOPIC = process.env.TOPIC || "all"; // usa 'all' por defecto

async function getNextNotification() {
  const snap = await db.collection("notifications")
    .where("active", "==", true)
    .orderBy("seq")
    .limit(1)
    .get();

  if (snap.empty) {
    console.log("No hay notificaciones activas. Reactivando...");
    const all = await db.collection("notifications").get();
    const batch = db.batch();
    all.forEach(doc => batch.update(doc.ref, { active: true }));
    await batch.commit();
    return getNextNotification();
  }
  return snap.docs[0];
}

async function main() {
  try {
    const doc = await getNextNotification();
    const notif = doc.data();
    console.log("Enviando seq:", notif.seq, "title:", notif.title);

    // Enviar con topic en variable
    const res = await messaging.send({ topic: TOPIC, notification: { title: notif.title, body: notif.body } });
    console.log("Resultado de send:", res);

    await doc.ref.update({ active: false, lastSentAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log("Marcado como enviado");
  } catch (err) {
    console.error("❌ Error enviando notificación:", err);
    process.exit(1);
  }
}

main();
