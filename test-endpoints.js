const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

async function run() {
  const MONGO_URI = "mongodb://edugenie2026_db_user:YueWoDCkvaBCRnAK@ac-w0t3kwv-shard-00-00.mmg0juj.mongodb.net:27017,ac-w0t3kwv-shard-00-01.mmg0juj.mongodb.net:27017,ac-w0t3kwv-shard-00-02.mmg0juj.mongodb.net:27017/edugenie_db?ssl=true&replicaSet=atlas-ppnonn-shard-0&authSource=admin&appName=Edugenie0";
  const JWT_SECRET = "edugenie_super_secret_key_2027";

  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to DB...');

    // Create Mock Data
    const studentId = new mongoose.Types.ObjectId();
    const instructorId = new mongoose.Types.ObjectId();
    const courseId = new mongoose.Types.ObjectId();
    const sectionId = new mongoose.Types.ObjectId();
    const lessonId = new mongoose.Types.ObjectId();

    await mongoose.connection.collection('users').insertOne({
      _id: studentId,
      email: 'test_student@example.com',
      role: 'student',
      firstName: 'Test',
      lastName: 'Student'
    });

    await mongoose.connection.collection('courses').insertOne({
      _id: courseId,
      title: 'Test Course',
      instructorId: instructorId,
      courseStatus: 'published',
      sections: [{
        _id: sectionId,
        title: 'Section 1',
        lessons: [{
          _id: lessonId,
          title: 'Lesson 1',
          videoUrl: 'http://video.com',
          videoDuration: 120,
          isFree: true,
          isPublished: true
        }]
      }]
    });

    await mongoose.connection.collection('enrollments').insertOne({
      _id: new mongoose.Types.ObjectId(),
      studentId: studentId,
      courseId: courseId,
      type: 'full_course',
      sectionIds: [],
      progressPercentage: 0,
      completedLessons: []
    });

    console.log('Mock data created.');
    
    // Create token
    const token = jwt.sign({ userId: studentId.toString(), email: 'test_student@example.com', role: 'student' }, JWT_SECRET);

    const baseUrl = 'http://localhost:3000';
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 1. GET /lessons/:lessonId
    console.log(`\n===========================================`);
    console.log(`1. Testing GET /lessons/${lessonId}`);
    console.log(`===========================================`);
    let res = await fetch(`${baseUrl}/lessons/${lessonId}`, { headers });
    console.log(`Status: ${res.status}`);
    console.log(await res.json());

    // 2. POST /progress/lesson
    console.log(`\n===========================================`);
    console.log(`2. Testing POST /progress/lesson`);
    console.log(`===========================================`);
    res = await fetch(`${baseUrl}/progress/lesson`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        lessonId: lessonId.toString(),
        watchedDuration: 45,
        isCompleted: true
      })
    });
    console.log(`Status: ${res.status}`);
    console.log(await res.json());

    // 3. GET /courses/:courseId/resume
    console.log(`\n===========================================`);
    console.log(`3. Testing GET /courses/${courseId}/resume`);
    console.log(`===========================================`);
    res = await fetch(`${baseUrl}/courses/${courseId}/resume`, { headers });
    console.log(`Status: ${res.status}`);
    console.log(await res.json());

    // 4. POST /lessons/:lessonId/notes
    console.log(`\n===========================================`);
    console.log(`4. Testing POST /lessons/${lessonId}/notes`);
    console.log(`===========================================`);
    res = await fetch(`${baseUrl}/lessons/${lessonId}/notes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: "This is a great lesson! I need to remember this part.",
        timestamp: 45
      })
    });
    console.log(`Status: ${res.status}`);
    console.log(await res.json());

    // 5. GET /lessons/:lessonId/notes
    console.log(`\n===========================================`);
    console.log(`5. Testing GET /lessons/${lessonId}/notes`);
    console.log(`===========================================`);
    res = await fetch(`${baseUrl}/lessons/${lessonId}/notes`, { headers });
    console.log(`Status: ${res.status}`);
    console.log(await res.json());

    // Cleanup
    await mongoose.connection.collection('users').deleteOne({ _id: studentId });
    await mongoose.connection.collection('courses').deleteOne({ _id: courseId });
    await mongoose.connection.collection('enrollments').deleteOne({ studentId: studentId });
    await mongoose.connection.collection('progresses').deleteMany({ studentId: studentId });
    await mongoose.connection.collection('notes').deleteMany({ studentId: studentId });
    console.log('\nCleanup complete. Mock data removed from Database.');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
