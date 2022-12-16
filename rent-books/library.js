// const readline = require("readline");
const express = require("express");
const path = require("path");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

require("dotenv").config({
  path: path.resolve(__dirname, ".env"),
});

// express config
const app = express();
let port = process.env.PORT || 4000;

// db username password
const userName = process.env.MONGO_DB_USERNAME;
const password = process.env.MONGO_DB_PASSWORD;
const dbName = process.env.MONGO_DB_NAME;
const collectionName = process.env.MONGO_COLLECTION;

/* Our database and collection */
const databaseAndCollection = {
  db: dbName,
  user_collection: collectionName,
  rent_collection: "rent",
};

const uri = `mongodb+srv://${userName}:${password}@cluster0.jcxzpgx.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

// set public directory for assets
app.use(express.static("public"));
// set view engine ejs
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
// Form element is sending urlencoded data
app.use(express.urlencoded({ extended: true }));

// config for get user inputs from console
// const rl = readline.createInterface({
//   input: process.stdin,
//   output: process.stdout,
// });

// get arguments in array when typing command node summerCampServer.js 3000
// args -> ['summerCampServer.js', '3000']
// let args = process.argv.slice(2); // array slice to ['3000']

// // validate arguments, args[0] -> 3000
// if (args[0]) {
//   // args[0] has integer and assign to port variable if not it will use default value 4000
//   port = parseInt(args[0]);
// }

// home page
app.get("/", (request, response) => {
  response.render("pages/index");
});
app.get("/search", async (request, response) => {
  response.render("pages/searchBooks");
});

// search results
app.get("/searchProcess", async (request, response) => {
  const bookName = request.query.bookName;
  const email = request.query.email;
  if (email && bookName) {
    // request api books and display search results
    let bookResults = "";
    // offset is start with
    // limit=10&offset=20
    const fetchResponse = await fetch(
      "http://openlibrary.org/search.json?q=" + bookName + "&limit=10"
    );
    const results = await fetchResponse.json();
    books = results.docs.forEach((book) => {
      const bookId = book.lending_edition_s
        ? book.lending_edition_s
        : book.seed[0].substr(7);
      let coverImagSrc = "/img/avatar_book-lg.png";

      if (book.ebook_access === "borrowable" && book.lending_edition_s) {
        coverImagSrc = `http://covers.openlibrary.org/b/olid/${book.lending_edition_s}-M.jpg`;
      }
      const publishDate = book.first_publish_year;
      const authorName = book.author_name ? book.author_name.join(", ") : "";

      bookResults += `<div class="book-item">
        <div><img src="${coverImagSrc}" class="book-cover-img"></div>
        <div class="book-content">
          <h3 class="title">${book.title}</h3>
          <p>by ${authorName}</p>
          <p class="book-published">First published in ${publishDate}</p>
          <p class="small muted">${book.edition_count} editions in ${book.language.length} languages</p>
          <form action="/rentProcess" method="post">
            <input type="hidden" name="email" value="${email}">
            <input type="hidden" name="bookId" value="${bookId}">
            <input type="submit" class="more-details" value="Rent this book">
          </form>
        </div>
      </div>`;
    });
    response.render("pages/searchBooksResults", { bookName, bookResults });
  }
});

app.post("/rentProcess", async (request, response) => {
  const bookId = request.body.bookId;
  const email = request.body.email;
  if (bookId) {
    const fetchResponse = await fetch(
      `http://openlibrary.org/books/${bookId}.json`
    );
    const result = await fetchResponse.json();
    const book = {
      bookId: bookId,
      bookTitle: result.title,
      authorName: result.by_statement,
      publishDate: result.publish_date,
      publisher: result.publishers ? result.publishers.join(", ") : "",
      pages: result.number_of_pages,
      language: result.languages
        ? result.languages.map((lang) => lang.key.substr(11))[0]
        : "",
    };

    let coverImagSrc = "/img/avatar_book-lg.png";

    coverImagSrc = `http://covers.openlibrary.org/b/olid/${bookId}-M.jpg`;
    book.coverImagSrc = coverImagSrc;
    book.rent_completed_at = new Date();

    try {
      await client.connect();

      let userData = { email };
      const db = client
        .db(databaseAndCollection.db)
        .collection(databaseAndCollection.user_collection);

      const user = await db.findOne(userData);
      let userId = null;
      if (user) {
        await db.updateOne(userData, { $set: userData });
        userId = user._id;
      } else {
        const insertedData = await db.insertOne(userData);
        userId = insertedData.insertedId;
      }
      book._userId = userId;

      await client
        .db(databaseAndCollection.db)
        .collection(databaseAndCollection.rent_collection)
        .insertOne(book);
    } catch (e) {
      console.log(e);
    } finally {
      await client.close();
    }

    response.render("pages/book", book);
  }
});

app.get("/profile", async (request, response) => {
  response.render("pages/profile");
});

app.post("/profileProcess", async (request, response) => {
  const email = request.body.email;
  if (email) {
    try {
      await client.connect();

      const user = await client
        .db(databaseAndCollection.db)
        .collection(databaseAndCollection.user_collection)
        .findOne({ email: email });
      if (user) {
        const cursor = await client
          .db(databaseAndCollection.db)
          .collection(databaseAndCollection.rent_collection)
          .find({ _userId: user._id });
        const result = await cursor.toArray();
        if (result) {
          let bookResults = "";
          result.forEach((book) => {
            bookResults += `<div class="book-item">
              <div><img src="${book.coverImagSrc}" class="book-cover-img"></div>
              <div class="book-content">
                  <h2 class="title">${book.bookTitle}</h2>
                  <p>Published date: ${book.publishDate} </p>
                  <p>Publisher: ${book.publisher} </p>
                  <p>Language: ${book.language} </p>
                  <p>Pages: ${book.pages} </p>
                  <hr />
                      <strong>Rented at ${book.rent_completed_at}</strong>
                  <hr />
                  <form action="/returnProcess" method="post">
                    <input type="hidden" name="email" value="${email}">
                    <input type="hidden" name="bookId" value="${book._id}">
                    <input type="submit" class="more-details" value="Return this book">
                  </form>
              </div>
            </div>`;
          });
          response.render("pages/profileProcess", { email, bookResults });
        }
      } else {
        response.render("pages/userNotFound");
      }
    } catch (e) {
      console.log(e);
    } finally {
      await client.close();
    }
  }
});

app.post("/returnProcess", async (request, response) => {
  const email = request.body.email;
  const bookId = request.body.bookId;
  console.log(bookId);
  if (email && bookId) {
    try {
      await client.connect();

      const book = await client
        .db(databaseAndCollection.db)
        .collection(databaseAndCollection.rent_collection)
        .findOne({ _id: new ObjectId(bookId) });
      if (book) {
        await client
          .db(databaseAndCollection.db)
          .collection(databaseAndCollection.rent_collection)
          .deleteOne({ _id: new ObjectId(bookId) });

        response.render("pages/bookReturned", { email, ...book });
      } else {
        response.render("pages/bookNotFound");
      }
    } catch (e) {
      console.log(e);
    } finally {
      await client.close();
    }
  }
});
// start server
app.listen(port, () => {
  console.log(`Web server started and running at http://localhost:${port}`);
  // askQuestion();
});

// function askQuestion() {
//   rl.question("Type stop to shutdown the server: ", function (input) {
//     // validate user inputs
//     if (input === "stop") {
//       rl.close();
//     } else {
//       console.log("Invalid command: " + input);
//       askQuestion();
//     }
//   });
// }
// shuttdown the server
// rl.on("close", function () {
//   console.log("Shutting down the server.");
//   process.exit(0);
// });
