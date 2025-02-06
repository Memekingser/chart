import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
    // 从 Firebase Console 复制配置信息到这里
    // Project Settings > General > Your apps > SDK setup and configuration
    apiKey: "AIzaSyATHLoVO4ZSU9LC-6LUK1rKKbwBiQiUU7k",
    authDomain: "bera-73e50.firebaseapp.com",
    databaseURL: "https://bera-73e50-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "bera-73e50",
    storageBucket: "bera-73e50.firebasestorage.app",
    messagingSenderId: "602581233399",
    appId: "1:602581233399:web:7d39a49a59a0344c14adf2",
    measurementId: "G-JLEKW52TBW"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app); 