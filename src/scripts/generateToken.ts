import jwt from "jsonwebtoken";

const token = jwt.sign(
  { role: "INTERVIEWER", userId: "test-user-123" },
  "your_jwt_secret",
  { expiresIn: "1d" }
);

console.log(token);