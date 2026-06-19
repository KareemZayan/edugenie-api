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
    const quizId = new mongoose.Types.ObjectId();
    const q1Id = new mongoose.Types.ObjectId();

    // Clean up first just in case
    await mongoose.connection.collection('users').deleteMany({ email: { $in: ['student_quiz_test@example.com', 'instructor_quiz_test@example.com'] } });

    await mongoose.connection.collection('users').insertMany([
      { _id: studentId, email: 'student_quiz_test@example.com', role: 'student', firstName: 'Student', lastName: 'Test' },
      { _id: instructorId, email: 'instructor_quiz_test@example.com', role: 'instructor', firstName: 'Instructor', lastName: 'Test' }
    ]);

    await mongoose.connection.collection('courses').insertOne({
      _id: courseId,
      title: 'Quiz Test Course',
      instructorId: instructorId,
      courseStatus: 'published',
      sections: [{
        _id: sectionId,
        title: 'Section 1 with Quiz',
        lessons: []
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
    
    const courseCheck = await mongoose.connection.collection('courses').findOne({ 'sections._id': sectionId });
    console.log('Course found by sectionId:', !!courseCheck);

    const enrollCheck = await mongoose.connection.collection('enrollments').findOne({
      studentId: studentId,
      courseId: courseId,
    });
    console.log('Enrollment found:', !!enrollCheck, enrollCheck?.type);

    const studentToken = jwt.sign({ id: studentId.toString(), email: 'student_quiz_test@example.com', role: 'student' }, JWT_SECRET);
    const instructorToken = jwt.sign({ id: instructorId.toString(), email: 'instructor_quiz_test@example.com', role: 'instructor' }, JWT_SECRET);

    const baseUrl = 'http://localhost:3000';
    
    // 1. POST /quizzes/generate (Instructor)
    console.log(`\n===========================================`);
    console.log(`1. Testing POST /quizzes/generate`);
    console.log(`===========================================`);
    let res = await fetch(`${baseUrl}/quizzes/generate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${instructorToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sectionId: sectionId.toString(),
        difficulty: 'MEDIUM',
        numberOfQuestions: 10,
        questionType: 'SINGLE_CHOICE'
      })
    });
    console.log(`Status: ${res.status}`);
    const genBody = await res.json();
    console.log(genBody);
    
    // Manually complete the quiz generation in DB so student can access it
    await mongoose.connection.collection('quizzes').updateOne(
      { sectionId: sectionId },
      { $set: { 
          generationStatus: 'COMPLETED', 
          passingScore: 50, 
          maxAttempts: 3, 
          timeLimit: 300,
          questions: [{
            _id: q1Id,
            questionText: 'What is 2 + 2?',
            options: ['3', '4', '5'],
            correctAnswers: ['4']
          }]
        } 
      }
    );

    // 2. GET /sections/:sectionId/quiz (Student)
    console.log(`\n===========================================`);
    console.log(`2. Testing GET /sections/${sectionId}/quiz`);
    console.log(`===========================================`);
    res = await fetch(`${baseUrl}/sections/${sectionId}/quiz`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    console.log(`Status: ${res.status}`);
    const getQuizBody = await res.json();
    console.log(getQuizBody);

    // 3. POST /sections/:sectionId/quiz/start (Student)
    console.log(`\n===========================================`);
    console.log(`3. Testing POST /sections/${sectionId}/quiz/start`);
    console.log(`===========================================`);
    res = await fetch(`${baseUrl}/sections/${sectionId}/quiz/start`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    console.log(`Status: ${res.status}`);
    const startBody = await res.json();
    console.log(startBody);

    // 4. POST /sections/:sectionId/quiz/submit (Student)
    console.log(`\n===========================================`);
    console.log(`4. Testing POST /sections/${sectionId}/quiz/submit`);
    console.log(`===========================================`);
    res = await fetch(`${baseUrl}/sections/${sectionId}/quiz/submit`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${studentToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId: startBody.attemptId,
        answers: [{
          questionId: getQuizBody.questions[0].questionId,
          selectedOptionIds: ['4']
        }]
      })
    });
    console.log(`Status: ${res.status}`);
    console.log(await res.json());

    // 5. GET /sections/:sectionId/quiz/attempts (Student)
    console.log(`\n===========================================`);
    console.log(`5. Testing GET /sections/${sectionId}/quiz/attempts`);
    console.log(`===========================================`);
    res = await fetch(`${baseUrl}/sections/${sectionId}/quiz/attempts`, {
      headers: { 'Authorization': `Bearer ${studentToken}` }
    });
    console.log(`Status: ${res.status}`);
    console.log(await res.json());

    // Cleanup
    await mongoose.connection.collection('users').deleteMany({ _id: { $in: [studentId, instructorId] } });
    await mongoose.connection.collection('courses').deleteOne({ _id: courseId });
    await mongoose.connection.collection('enrollments').deleteOne({ studentId: studentId });
    await mongoose.connection.collection('quizzes').deleteMany({ sectionId: sectionId });
    await mongoose.connection.collection('quizattempts').deleteMany({ studentId: studentId });
    console.log('\nCleanup complete. Mock data removed from Database.');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

run();
