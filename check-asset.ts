import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
    cloud_name: 'dxeoqi3kb',
    api_key: '692825251671289',
    api_secret: process.env.CLOUDINARY_API_SECRET, // pulled from your .env, never typed here
});

async function check() {
    try {
        const info = await cloudinary.api.resource(
            'edugenie/courses/videos/6a357d4becee9788189f3573/sections/6a358ce773b0e289af76ae2e/ojqd4ph7u2bc5o9lgeky_transcribed_1782524620990',
            { resource_type: 'raw', type: 'upload' }
        );
        console.log(JSON.stringify(info, null, 2));
    } catch (err: any) {
        console.error('ERROR:', err.message || err);
    }
}

check();