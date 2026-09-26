type SeedAssessmentQuestion = {
  id: string;
  subject: string;
  prompt: string;
  options: { id: string; label: string }[];
};

export const SEED_ASSESSMENT_QUESTIONS: SeedAssessmentQuestion[] = [
  {
    id: "math-1",
    subject: "mathematics",
    prompt: "What is 12 + 27?",
    options: [
      { id: "a", label: "39" },
      { id: "b", label: "35" },
      { id: "c", label: "41" },
      { id: "d", label: "29" },
    ],
  },
  {
    id: "math-2",
    subject: "mathematics",
    prompt: "If a book costs ₦500 and you buy 3, how much do you spend in total?",
    options: [
      { id: "a", label: "₦1,000" },
      { id: "b", label: "₦1,500" },
      { id: "c", label: "₦2,000" },
      { id: "d", label: "₦500" },
    ],
  },
  {
    id: "math-3",
    subject: "mathematics",
    prompt: "What is half of 84?",
    options: [
      { id: "a", label: "40" },
      { id: "b", label: "42" },
      { id: "c", label: "44" },
      { id: "d", label: "48" },
    ],
  },
  {
    id: "math-4",
    subject: "mathematics",
    prompt: "Which of these is an even number?",
    options: [
      { id: "a", label: "17" },
      { id: "b", label: "23" },
      { id: "c", label: "36" },
      { id: "d", label: "51" },
    ],
  },
  {
    id: "science-1",
    subject: "basic-science",
    prompt: "What do plants need to make their own food?",
    options: [
      { id: "a", label: "Sunlight, water, and carbon dioxide" },
      { id: "b", label: "Only soil" },
      { id: "c", label: "Only water" },
      { id: "d", label: "Salt and sugar" },
    ],
  },
  {
    id: "science-2",
    subject: "basic-science",
    prompt: "Which of these is a source of electrical energy?",
    options: [
      { id: "a", label: "A battery" },
      { id: "b", label: "A wooden spoon" },
      { id: "c", label: "A pillow" },
      { id: "d", label: "A rubber band" },
    ],
  },
  {
    id: "science-3",
    subject: "basic-science",
    prompt: "What state of matter is ice?",
    options: [
      { id: "a", label: "Gas" },
      { id: "b", label: "Liquid" },
      { id: "c", label: "Solid" },
      { id: "d", label: "Plasma" },
    ],
  },
  {
    id: "science-4",
    subject: "basic-science",
    prompt: "Which organ pumps blood around the human body?",
    options: [
      { id: "a", label: "The lungs" },
      { id: "b", label: "The heart" },
      { id: "c", label: "The stomach" },
      { id: "d", label: "The liver" },
    ],
  },
  {
    id: "logic-1",
    subject: "logical-reasoning",
    prompt: "What comes next in the sequence? 2, 4, 6, 8, __",
    options: [
      { id: "a", label: "9" },
      { id: "b", label: "10" },
      { id: "c", label: "11" },
      { id: "d", label: "12" },
    ],
  },
  {
    id: "logic-2",
    subject: "logical-reasoning",
    prompt: "A is taller than B. B is taller than C. Who is the shortest?",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
      { id: "d", label: "Cannot be determined" },
    ],
  },
  {
    id: "logic-3",
    subject: "logical-reasoning",
    prompt: "Which shape is the odd one out: Circle, Square, Triangle, Red?",
    options: [
      { id: "a", label: "Circle" },
      { id: "b", label: "Square" },
      { id: "c", label: "Triangle" },
      { id: "d", label: "Red" },
    ],
  },
  {
    id: "logic-4",
    subject: "logical-reasoning",
    prompt: "If all cats are animals, and Tom is a cat, then Tom is __.",
    options: [
      { id: "a", label: "A plant" },
      { id: "b", label: "An animal" },
      { id: "c", label: "A robot" },
      { id: "d", label: "Not sure" },
    ],
  },
  {
    id: "reading-1",
    subject: "reading-comprehension",
    prompt:
      "\"Amaka woke up early to prepare for her exams. She reviewed her notes and packed her bag before breakfast.\" What did Amaka do first?",
    options: [
      { id: "a", label: "Packed her bag" },
      { id: "b", label: "Ate breakfast" },
      { id: "c", label: "Reviewed her notes" },
      { id: "d", label: "Went to school" },
    ],
  },
  {
    id: "reading-2",
    subject: "reading-comprehension",
    prompt: "Which word is closest in meaning to \"begin\"?",
    options: [
      { id: "a", label: "End" },
      { id: "b", label: "Start" },
      { id: "c", label: "Pause" },
      { id: "d", label: "Stop" },
    ],
  },
  {
    id: "reading-3",
    subject: "reading-comprehension",
    prompt: "Which sentence is grammatically correct?",
    options: [
      { id: "a", label: "She go to school every day." },
      { id: "b", label: "She goes to school every day." },
      { id: "c", label: "She going to school every day." },
      { id: "d", label: "She gone to school every day." },
    ],
  },
  {
    id: "reading-4",
    subject: "reading-comprehension",
    prompt: "What is the opposite of \"difficult\"?",
    options: [
      { id: "a", label: "Hard" },
      { id: "b", label: "Easy" },
      { id: "c", label: "Slow" },
      { id: "d", label: "Complex" },
    ],
  },
];
