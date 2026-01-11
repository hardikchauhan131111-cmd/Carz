import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDDg4VoLvBaM5W5hptoZM5IMlpXkmaK_Wc",
    authDomain: "gamea-d6b3d.firebaseapp.com",
    projectId: "gamea-d6b3d",
    storageBucket: "gamea-d6b3d.firebasestorage.app",
    messagingSenderId: "872931747910",
    appId: "1:872931747910:web:26e1c3e09ccd1ac08f0247",
    measurementId: "G-RGCND4TQJC"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
