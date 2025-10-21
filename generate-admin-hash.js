const bcrypt = require('bcryptjs');

const password = "admin123";
const hashedPassword = bcrypt.hashSync(password, 10);

console.log("==========================================");
console.log("NEW ADMIN PASSWORD: admin123");
console.log("HASHED PASSWORD: " + hashedPassword);
console.log("==========================================");
console.log("Use this hash in your database UPDATE command");