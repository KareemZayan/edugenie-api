require("dotenv").config();
const cloudinary = require("cloudinary").v2;
cloudinary.config({ cloud_name: "dxeoqi3kb", api_key: "692825251671289", api_secret: "xJ8CvuSp2DVN_YSWPkQ0DiYVUeQ" });

cloudinary.api.resources({
  resource_type: "raw",
  type: "upload",
  prefix: "edugenie/courses/videos/6a357d4becee9788189f3573",
  max_results: 50,
}).then(r => console.log(JSON.stringify(r.resources.map(x => x.public_id), null, 2)))
  .catch(e => console.error("ERROR:", e.message || e));