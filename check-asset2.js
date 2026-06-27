require("dotenv").config();
const cloudinary = require("cloudinary").v2;
cloudinary.config({ cloud_name: "dxeoqi3kb", api_key: "692825251671289", api_secret: "xJ8CvuSp2DVN_YSWPkQ0DiYVUeQ" });

cloudinary.api.resource(
  "edugenie/courses/videos/6a357d4becee9788189f3573/sections/6a358ce773b0e289af76ae2e/ojqd4ph7u2bc5o9lgeky_transcribed_1782524620990.transcript",
  { resource_type: "raw", type: "upload" }
)
  .then(info => console.log(JSON.stringify(info, null, 2)))
  .catch(err => console.error("ERROR:", err.message || err));