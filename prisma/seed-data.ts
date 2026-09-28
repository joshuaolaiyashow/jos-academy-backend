export type SeedLessonType = 'note' | 'code';

export type SeedLesson = {
  title: string;
  contentType: SeedLessonType;
  content: string;
  duration: number;
};

export type SeedModule = {
  title: string;
  description: string;
  lessons: SeedLesson[];
};

export type SeedCourse = {
  name: string;
  category: string;
  shortDescription: string;
  fullDescription: string;
  duration: number;
  durationType: 'weeks' | 'Months';
  targetLevel: 'Foundation' | 'Intermediate' | 'Advanced';
  maxCohortSize: number;
  tuitionFee: number;
  heroImageName: string;
  modules: SeedModule[];
};

export const SEED_CATEGORIES: { name: string; description: string }[] = [
  {
    name: 'Software Engineering',
    description: 'Web development, backend APIs, and modern cloud stacks.',
  },
  {
    name: 'Robotics',
    description:
      'Build and program robots, from sensors and actuators to control loops.',
  },
  {
    name: 'Aerospace',
    description:
      'Flight mechanics, propulsion, and spacecraft guidance and control.',
  },
  {
    name: 'Artificial Intelligence',
    description: 'Neural networks, deep learning, and applied AI systems.',
  },
  {
    name: 'Machine Learning',
    description:
      'Statistical learning, model evaluation, and production ML workflows.',
  },
];

export const note = (
  title: string,
  content: string,
  duration: number,
): SeedLesson => ({
  title,
  contentType: 'note',
  content,
  duration,
});

export const code = (
  title: string,
  content: string,
  duration: number,
): SeedLesson => ({
  title,
  contentType: 'code',
  content,
  duration,
});

export const unsplash = (photoId: string): string =>
  `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=1200&q=80`;

export const SEED_COURSES: SeedCourse[] = [
  {
    name: 'Full-Stack Web Development Bootcamp',
    category: 'Software Engineering',
    shortDescription:
      'Master full-stack development with Node.js, NestJS, React, and PostgreSQL.',
    fullDescription:
      'Become a job-ready full-stack developer. Learn modern HTML/CSS, TypeScript, scalable backend architectures with NestJS and Prisma, database modeling, authentication, and deployment.',
    duration: 12,
    durationType: 'weeks',
    targetLevel: 'Foundation',
    maxCohortSize: 30,
    tuitionFee: 50000,
    heroImageName: unsplash('photo-1517694712202-14dd9538aa97'),
    modules: [
      {
        title: 'Module 1: HTML, CSS & Responsive Design',
        description:
          'Responsive layouts, Flexbox, CSS Grid, and semantic HTML5.',
        lessons: [
          note(
            'Semantic HTML and document structure',
            'Use header, nav, main, section, and footer so browsers, screen readers, and search engines understand the page. Prefer semantic elements over generic div wrappers.',
            20,
          ),
          code(
            'Flexbox in practice',
            '.row {\n  display: flex;\n  gap: 1rem;\n  align-items: center;\n  justify-content: space-between;\n}',
            25,
          ),
          note(
            'CSS Grid for page layouts',
            'Grid lays out rows and columns together. Define tracks with grid-template-columns and place items with grid-area for two-dimensional layouts.',
            30,
          ),
        ],
      },
      {
        title: 'Module 2: Modern JavaScript & TypeScript Fundamentals',
        description:
          'ES6+, async/await, closures, and TypeScript types and interfaces.',
        lessons: [
          note(
            'Closures and scope',
            'A closure keeps access to the variables of the function it was created in, even after that function has returned. This is the basis of private state and factories.',
            25,
          ),
          code(
            'Async/await and error handling',
            'async function loadUser(id: string) {\n  try {\n    const res = await fetch(`/api/users/${id}`);\n    if (!res.ok) throw new Error(res.statusText);\n    return await res.json();\n  } catch (error) {\n    console.error(error);\n    throw error;\n  }\n}',
            30,
          ),
          note(
            'TypeScript types versus interfaces',
            'Use interfaces for object shapes that may be extended and type aliases for unions and intersections. Both are erased at compile time.',
            20,
          ),
        ],
      },
      {
        title: 'Module 3: Backend Architecture with NestJS & Express',
        description:
          'REST APIs, dependency injection, guards, and DTO validation.',
        lessons: [
          note(
            'Modules, controllers, and providers',
            'A Nest module groups related controllers and providers. Controllers handle HTTP, providers hold business logic and are injected through constructors.',
            30,
          ),
          code(
            'Validating requests with DTOs',
            'export class CreatePostDto {\n  @IsString() @IsNotEmpty()\n  title: string;\n\n  @IsString() @MinLength(20)\n  body: string;\n}',
            25,
          ),
          note(
            'Guards and role-based access',
            'A guard decides whether a request may proceed. Combine a JWT guard with a roles guard so route handlers never check permissions themselves.',
            25,
          ),
        ],
      },
      {
        title: 'Module 4: Database Modeling with PostgreSQL & Prisma',
        description:
          'Relational schema design, transactions, migrations, and query optimisation.',
        lessons: [
          note(
            'Designing relations',
            'Model one-to-many with a foreign key on the many side, and many-to-many through a join table that can carry its own columns.',
            25,
          ),
          code(
            'Transactions with Prisma',
            'await prisma.$transaction([\n  prisma.user.update({ where: { id }, data: { credits: { decrement: cost } } }),\n  prisma.enrollment.create({ data: { userId: id, courseId } }),\n]);',
            30,
          ),
        ],
      },
      {
        title: 'Module 5: Fullstack Deployment & DevOps Basics',
        description: 'Containers, cloud deployment, CI/CD, and monitoring.',
        lessons: [
          note(
            'Containerising a Node service',
            'A multi-stage Dockerfile builds in one stage and copies only the compiled output into a slim runtime image, keeping images small and secure.',
            25,
          ),
          note(
            'CI/CD pipelines',
            'Run lint, type-check, and tests on every push, and deploy only from a green main branch. Keep secrets in the platform secret store, never in the repo.',
            20,
          ),
        ],
      },
    ],
  },
  {
    name: 'Introduction to Robotics',
    category: 'Robotics',
    shortDescription:
      'Sensors, actuators, and control loops: build your first working robot.',
    fullDescription:
      'A hands-on introduction to robotics for complete beginners. You will learn how robots sense and act, how to read sensors, drive motors, and write a simple control loop, then combine them into a line-following robot.',
    duration: 8,
    durationType: 'weeks',
    targetLevel: 'Foundation',
    maxCohortSize: 40,
    tuitionFee: 15000,
    heroImageName: unsplash('photo-1485827404703-89b55fcc595e'),
    modules: [
      {
        title: 'Module 1: How Robots Work',
        description:
          'The sense-think-act loop and the parts every robot shares.',
        lessons: [
          note(
            'The sense-think-act loop',
            'Every robot repeats three steps: sense the world, decide what to do, and act. Faster, more accurate loops give smoother behaviour.',
            15,
          ),
          note(
            'Actuators: motors and servos',
            'DC motors give continuous rotation, servos hold an angle, and steppers move in precise increments. Pick the one that matches the motion you need.',
            20,
          ),
          note(
            'Power and safety basics',
            'Size your battery for peak current, add a fuse, and never power motors from the microcontroller pin. Disconnect power before rewiring.',
            15,
          ),
        ],
      },
      {
        title: 'Module 2: Sensors and Signals',
        description: 'Reading distance, light, and motion sensors reliably.',
        lessons: [
          note(
            'Analog versus digital sensors',
            'Digital sensors report on/off or a bus value; analog sensors report a voltage that an ADC converts to a number. Always calibrate against known values.',
            20,
          ),
          code(
            'Reading an ultrasonic distance sensor',
            'long readDistanceCm() {\n  digitalWrite(TRIG, LOW); delayMicroseconds(2);\n  digitalWrite(TRIG, HIGH); delayMicroseconds(10);\n  digitalWrite(TRIG, LOW);\n  long echo = pulseIn(ECHO, HIGH);\n  return echo / 58;\n}',
            25,
          ),
          note(
            'Filtering noisy readings',
            'A moving average smooths random noise at the cost of lag. Use a median filter when readings contain occasional wild spikes.',
            20,
          ),
        ],
      },
      {
        title: 'Module 3: Control and Your First Robot',
        description: 'Proportional control and a line-following build.',
        lessons: [
          note(
            'On/off versus proportional control',
            'On/off control oscillates around the target. Proportional control scales the correction to the error, giving smoother, more stable motion.',
            20,
          ),
          code(
            'A proportional line follower',
            'const float KP = 0.8;\nvoid loop() {\n  int error = readLinePosition() - CENTER;\n  int correction = KP * error;\n  setMotors(BASE_SPEED - correction, BASE_SPEED + correction);\n}',
            30,
          ),
          note(
            'Testing and tuning your robot',
            'Change one parameter at a time and record the result. Start with a low gain, raise it until the robot oscillates, then back off slightly.',
            25,
          ),
        ],
      },
    ],
  },
  {
    name: 'Embedded Systems & Microcontrollers',
    category: 'Robotics',
    shortDescription:
      'Program microcontrollers in C: GPIO, timers, interrupts, and serial buses.',
    fullDescription:
      'Go beneath the Arduino abstractions. You will configure GPIO, timers, and interrupts directly, talk to peripherals over I2C and SPI, and structure firmware so it stays reliable in real-time conditions.',
    duration: 10,
    durationType: 'weeks',
    targetLevel: 'Intermediate',
    maxCohortSize: 30,
    tuitionFee: 30000,
    heroImageName: unsplash('photo-1518770660439-4636190af475'),
    modules: [
      {
        title: 'Module 1: Registers, GPIO and Timers',
        description: 'Direct hardware control and precise timing.',
        lessons: [
          note(
            'Memory-mapped registers',
            'Peripherals are controlled by reading and writing fixed memory addresses. Bit masks let you change one pin without disturbing the others.',
            25,
          ),
          code(
            'Toggling a pin with bit masks',
            'DDRB |= (1 << PB5);      // set pin as output\nPORTB ^= (1 << PB5);     // toggle the pin',
            20,
          ),
          note(
            'Hardware timers and PWM',
            'A timer counts clock ticks in hardware. Compare-match output turns that count into PWM for dimming LEDs and setting motor speed without CPU work.',
            30,
          ),
        ],
      },
      {
        title: 'Module 2: Interrupts and Concurrency',
        description: 'Responding to events without polling.',
        lessons: [
          note(
            'Interrupt service routines',
            'Keep an ISR short: set a flag or copy a value and return. Do the heavy work in the main loop, and mark shared variables volatile.',
            25,
          ),
          code(
            'Debouncing a button with an interrupt',
            'volatile uint32_t lastPress = 0;\nISR(INT0_vect) {\n  uint32_t now = millis();\n  if (now - lastPress > 50) { pressed = true; lastPress = now; }\n}',
            25,
          ),
          note(
            'Race conditions in firmware',
            'A multi-byte value can change mid-read if an interrupt fires. Disable interrupts briefly around the read, or use atomic access.',
            20,
          ),
        ],
      },
      {
        title: 'Module 3: Serial Buses and Peripherals',
        description: 'I2C, SPI, and UART communication.',
        lessons: [
          note(
            'UART, I2C and SPI compared',
            'UART is simple point-to-point, I2C shares two wires among many addressed devices, and SPI is the fastest with a chip-select per device.',
            25,
          ),
          code(
            'Reading a sensor over I2C',
            'Wire.beginTransmission(SENSOR_ADDR);\nWire.write(REG_TEMP);\nWire.endTransmission(false);\nWire.requestFrom(SENSOR_ADDR, 2);\nint16_t raw = (Wire.read() << 8) | Wire.read();',
            30,
          ),
          note(
            'Structuring reliable firmware',
            'Split code into drivers, a state machine, and a scheduler. Add a watchdog timer so the board recovers if the main loop ever hangs.',
            25,
          ),
        ],
      },
    ],
  },
  {
    name: 'Aerospace Fundamentals: Flight & Propulsion',
    category: 'Aerospace',
    shortDescription: 'How aircraft fly and how engines produce thrust.',
    fullDescription:
      'An introduction to aerodynamics, flight mechanics, and propulsion. You will learn how lift and drag arise, how aircraft stay stable, and how jet and rocket engines convert fuel into thrust.',
    duration: 8,
    durationType: 'weeks',
    targetLevel: 'Foundation',
    maxCohortSize: 40,
    tuitionFee: 20000,
    heroImageName: unsplash('photo-1436491865332-7a61a109cc05'),
    modules: [
      {
        title: 'Module 1: Aerodynamics',
        description: 'Lift, drag, and the atmosphere.',
        lessons: [
          note(
            'The standard atmosphere',
            'Pressure, temperature, and density fall with altitude. Air density directly scales lift, drag, and engine thrust.',
            20,
          ),
          note(
            'How wings generate lift',
            'A wing deflects air downward and creates a pressure difference. Lift grows with airspeed squared, wing area, and angle of attack, until the wing stalls.',
            25,
          ),
          code(
            'Computing lift and drag',
            'def lift(rho, v, area, cl):\n    return 0.5 * rho * v**2 * area * cl\n\ndef drag(rho, v, area, cd):\n    return 0.5 * rho * v**2 * area * cd',
            25,
          ),
        ],
      },
      {
        title: 'Module 2: Flight Mechanics and Stability',
        description: 'Forces in flight and how aircraft stay controllable.',
        lessons: [
          note(
            'The four forces',
            'In steady level flight lift equals weight and thrust equals drag. Any imbalance produces acceleration, climb, or descent.',
            20,
          ),
          note(
            'Static and dynamic stability',
            'A statically stable aircraft returns toward its trim state after a disturbance. Dynamic stability describes whether that return settles or oscillates.',
            25,
          ),
          note(
            'Control surfaces',
            'Ailerons roll the aircraft, the elevator pitches it, and the rudder yaws it. Each works by changing the lift on a surface to create a moment.',
            20,
          ),
        ],
      },
      {
        title: 'Module 3: Propulsion',
        description: 'Jet engines, propellers, and rockets.',
        lessons: [
          note(
            'Thrust and the rocket equation',
            'Thrust comes from accelerating mass rearward. The rocket equation links the velocity change to exhaust speed and the ratio of initial to final mass.',
            25,
          ),
          code(
            'Delta-v from the rocket equation',
            'import math\n\ndef delta_v(isp, m0, mf, g0=9.80665):\n    return isp * g0 * math.log(m0 / mf)',
            20,
          ),
          note(
            'Turbojets and turbofans',
            'A gas turbine compresses air, burns fuel, and expands the gas through a turbine. A turbofan bypasses extra air around the core for better efficiency.',
            25,
          ),
        ],
      },
    ],
  },
  {
    name: 'Spacecraft Guidance & Control',
    category: 'Aerospace',
    shortDescription:
      'Orbits, attitude dynamics, and feedback control for spacecraft.',
    fullDescription:
      'An advanced course on how spacecraft find their way and hold their orientation. You will model orbital motion, derive attitude dynamics, and design and simulate feedback controllers.',
    duration: 3,
    durationType: 'Months',
    targetLevel: 'Advanced',
    maxCohortSize: 20,
    tuitionFee: 60000,
    heroImageName: unsplash('photo-1446776811953-b23d57bd21aa'),
    modules: [
      {
        title: 'Module 1: Orbital Mechanics',
        description: 'Kepler orbits, transfers, and perturbations.',
        lessons: [
          note(
            'Two-body motion',
            'A spacecraft in a central gravity field follows a conic section. Energy and angular momentum are conserved and define the orbit.',
            30,
          ),
          code(
            'Propagating an orbit numerically',
            'def step(r, v, mu, dt):\n    a = -mu * r / np.linalg.norm(r) ** 3\n    v = v + a * dt\n    r = r + v * dt\n    return r, v',
            35,
          ),
          note(
            'Hohmann transfers',
            'The most fuel-efficient two-burn transfer between circular coplanar orbits uses an elliptical arc tangent to both.',
            25,
          ),
        ],
      },
      {
        title: 'Module 2: Attitude Dynamics',
        description: 'Rotation representations and rigid-body equations.',
        lessons: [
          note(
            'Quaternions for attitude',
            'Quaternions avoid the gimbal lock of Euler angles and compose rotations with a single multiplication. Always renormalise after integrating.',
            30,
          ),
          note(
            "Euler's rotation equations",
            'The angular velocity of a rigid body evolves according to its inertia tensor and the applied torque. Torque-free motion about an unstable axis tumbles.',
            30,
          ),
          note(
            'Reaction wheels and thrusters',
            'Reaction wheels exchange angular momentum with the body without using propellant, but saturate and must be desaturated with thrusters or magnetorquers.',
            25,
          ),
        ],
      },
      {
        title: 'Module 3: Control Design',
        description: 'Feedback control and simulation.',
        lessons: [
          note(
            'PD attitude control',
            'A proportional term drives the error to zero and a derivative term adds damping. Together they give a fast, well-damped response.',
            25,
          ),
          code(
            'A simple PD controller',
            'def pd_torque(q_err, omega, kp, kd):\n    return -kp * q_err[1:] - kd * omega',
            25,
          ),
          note(
            'Verifying the controller',
            'Test against realistic disturbances, sensor noise, and actuator limits in simulation before any hardware work. Check stability margins, not just step response.',
            30,
          ),
        ],
      },
    ],
  },
  {
    name: 'Machine Learning Foundations',
    category: 'Machine Learning',
    shortDescription:
      'Regression, classification, and honest model evaluation with Python.',
    fullDescription:
      'Learn the core ideas behind machine learning: fitting models to data, preventing overfitting, and evaluating results honestly. Every concept is practised in Python with scikit-learn on real datasets.',
    duration: 8,
    durationType: 'weeks',
    targetLevel: 'Foundation',
    maxCohortSize: 50,
    tuitionFee: 25000,
    heroImageName: unsplash('photo-1555949963-ff9fe0c870eb'),
    modules: [
      {
        title: 'Module 1: Data and Linear Models',
        description: 'Preparing data and fitting regression models.',
        lessons: [
          note(
            'What machine learning is',
            'A model learns a mapping from inputs to outputs by minimising an error on examples. The goal is performance on data it has never seen.',
            15,
          ),
          code(
            'Linear regression with scikit-learn',
            'from sklearn.linear_model import LinearRegression\n\nmodel = LinearRegression().fit(X_train, y_train)\nprint(model.score(X_test, y_test))',
            25,
          ),
          note(
            'Cleaning and scaling features',
            'Handle missing values, encode categories, and scale numeric features. Fit any scaler on the training split only to avoid leaking information.',
            25,
          ),
        ],
      },
      {
        title: 'Module 2: Classification',
        description: 'Logistic regression, trees, and metrics.',
        lessons: [
          note(
            'Logistic regression',
            'Logistic regression passes a linear score through a sigmoid to produce a probability. Choose the decision threshold to fit the cost of each type of error.',
            25,
          ),
          code(
            'Decision trees and random forests',
            'from sklearn.ensemble import RandomForestClassifier\n\nclf = RandomForestClassifier(n_estimators=200, random_state=42)\nclf.fit(X_train, y_train)',
            25,
          ),
          note(
            'Precision, recall, and the confusion matrix',
            'Accuracy hides problems on imbalanced data. Precision measures how many flagged items were right; recall measures how many real cases you caught.',
            25,
          ),
        ],
      },
      {
        title: 'Module 3: Evaluation and Generalisation',
        description: 'Overfitting, validation, and tuning.',
        lessons: [
          note(
            'Overfitting and the bias-variance trade-off',
            'A model that is too flexible memorises noise; one that is too simple misses structure. Regularisation and more data both reduce overfitting.',
            25,
          ),
          code(
            'Cross-validation and grid search',
            'from sklearn.model_selection import GridSearchCV\n\nsearch = GridSearchCV(clf, {"max_depth": [4, 8, 16]}, cv=5)\nsearch.fit(X_train, y_train)',
            30,
          ),
          note(
            'Reporting results honestly',
            'Hold out a final test set and touch it once. Report the metric with a confidence interval and compare against a simple baseline.',
            20,
          ),
        ],
      },
    ],
  },
  {
    name: 'Deep Learning with PyTorch',
    category: 'Artificial Intelligence',
    shortDescription: 'Build, train, and debug neural networks in PyTorch.',
    fullDescription:
      'A practical deep learning course. You will build neural networks from tensors and autograd, train convolutional networks on images, and learn the habits that make training stable and debuggable.',
    duration: 10,
    durationType: 'weeks',
    targetLevel: 'Intermediate',
    maxCohortSize: 30,
    tuitionFee: 40000,
    heroImageName: unsplash('photo-1677442136019-21780ecad995'),
    modules: [
      {
        title: 'Module 1: Tensors and Autograd',
        description: 'The building blocks of PyTorch.',
        lessons: [
          note(
            'Tensors and devices',
            'Tensors are n-dimensional arrays that can live on a CPU or GPU. Keep the model and its data on the same device.',
            20,
          ),
          code(
            'Automatic differentiation',
            'x = torch.tensor(2.0, requires_grad=True)\ny = x ** 3 + 2 * x\ny.backward()\nprint(x.grad)  # 3*x**2 + 2 = 14',
            20,
          ),
          note(
            'The training loop',
            'Each step runs a forward pass, computes the loss, backpropagates, and updates the weights. Remember to zero the gradients every iteration.',
            25,
          ),
        ],
      },
      {
        title: 'Module 2: Convolutional Networks',
        description: 'Learning from images.',
        lessons: [
          note(
            'Convolutions and pooling',
            'A convolution slides a small learned filter across the image, sharing weights and detecting local patterns. Pooling shrinks the feature map.',
            25,
          ),
          code(
            'A small CNN classifier',
            'class Net(nn.Module):\n    def __init__(self):\n        super().__init__()\n        self.conv = nn.Sequential(nn.Conv2d(1, 16, 3), nn.ReLU(), nn.MaxPool2d(2))\n        self.fc = nn.Linear(16 * 13 * 13, 10)\n\n    def forward(self, x):\n        return self.fc(self.conv(x).flatten(1))',
            35,
          ),
          note(
            'Data augmentation',
            'Random flips, crops, and colour jitter create new training examples on the fly and reduce overfitting. Never augment the validation set.',
            20,
          ),
        ],
      },
      {
        title: 'Module 3: Training That Works',
        description: 'Optimisers, regularisation, and debugging.',
        lessons: [
          note(
            'Optimisers and learning-rate schedules',
            'Adam is a strong default. A learning-rate schedule with warm-up and decay usually beats a fixed rate.',
            25,
          ),
          code(
            'Overfit one batch first',
            'batch = next(iter(loader))\nfor step in range(200):\n    loss = criterion(model(batch.x), batch.y)\n    opt.zero_grad(); loss.backward(); opt.step()\n# The loss should approach zero. If not, there is a bug.',
            20,
          ),
          note(
            'Diagnosing a network that will not learn',
            'Check the data pipeline and labels first, then the loss and learning rate, and only then the architecture. Log gradient norms to spot vanishing or exploding gradients.',
            25,
          ),
        ],
      },
    ],
  },
];

export type SeedLiveSession = {
  courseName: string;
  title: string;
  type: 'Lecture' | 'Workshop' | 'QandA';
  daysFromNow: number;
  hourUtc: number;
  durationMins: number;
};

export const SEED_LIVE_SESSIONS: SeedLiveSession[] = [
  {
    courseName: 'Introduction to Robotics',
    title: 'Live build: your first line follower',
    type: 'Workshop',
    daysFromNow: 2,
    hourUtc: 17,
    durationMins: 90,
  },
  {
    courseName: 'Machine Learning Foundations',
    title: 'Live lecture: overfitting and validation',
    type: 'Lecture',
    daysFromNow: 4,
    hourUtc: 18,
    durationMins: 60,
  },
  {
    courseName: 'Full-Stack Web Development Bootcamp',
    title: 'Office hours: NestJS and Prisma Q&A',
    type: 'QandA',
    daysFromNow: 6,
    hourUtc: 16,
    durationMins: 45,
  },
  {
    courseName: 'Aerospace Fundamentals: Flight & Propulsion',
    title: 'Live lecture: lift, drag, and stall',
    type: 'Lecture',
    daysFromNow: 8,
    hourUtc: 17,
    durationMins: 60,
  },
];
