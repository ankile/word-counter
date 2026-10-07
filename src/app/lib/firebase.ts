import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// The "word-counter" web app in the Book Tracker Firebase project (book-tracker-d8f24).
// API key, app ID and reCAPTCHA site key are public identifiers.
const app = initializeApp({
  apiKey: "AIzaSyCoQYyM7DjMC_pQmBePwh77Arq_sT791fw",
  authDomain: "book-tracker-d8f24.firebaseapp.com",
  projectId: "book-tracker-d8f24",
  appId: "1:440931185227:web:3325ac44d96f668ce8d3ce",
  messagingSenderId: "440931185227",
});

// Book Tracker enforces App Check on Auth and Firestore. This site key allows word-counter.ankile.com and localhost.
if (typeof window !== "undefined") {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider("6LdUCOMtAAAAAEkvlPOGGHnNefhflkHN7X_O4gln"),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const db = getFirestore(app);
