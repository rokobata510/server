var express = require('express');
var mysql = require('mysql');
var swaggerUi = require('swagger-ui-express');
var YAML = require('yamljs');
var bcrypt = require('bcrypt');
var jwt = require('jsonwebtoken');
const cors = require('cors');


var con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "szop"
});

con.connect(function (err) {
  if (err) throw err;
  console.log("Connected to the database!");
});

var swaggerDocument = YAML.load('./openapi.yaml');

var app = express();

app.use(express.json());
app.use(cors());



app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.post('/users', function (req, res) {
  var username = req.body.username;
  var password = req.body.password;
  var is_admin = req.body.is_admin || false;

  if (!username || !password) {
    res.status(400).send('Error: Username and password are required');
  } else {
    bcrypt.hash(password, 10, function (err, hash) {
      if (err) throw err;
      con.query("INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)", [username, hash, is_admin], function (err, result) {
        if (err) throw err;
        console.log("1 user inserted");
        res.send('User created!');
      });
    });
  }
});

app.get('/users', adminMiddleware, function (req, res) {
  con.query("SELECT * FROM users", function (err, result) {
    if (err) throw err;
    res.json(result);
  });
});

function adminMiddleware(req, res, next) {
  var bearerHeader = req.headers['authorization'];
  if (!bearerHeader) {
    res.status(401).send('Error: Token is required');
  } else {
    var bearer = bearerHeader.split(' ');
    var token = bearer[1];
    jwt.verify(token, 'A7BSWN', function (err, decoded) {
      if (err) {
        res.status(401).send('Error: Invalid token ');
      } else {
        if (decoded.is_admin) {
          next();
        } else {
          res.status(403).send('Error: You do not have the necessary permissions');
        }
      }
    });
  }
}

app.get('/users/:id', function (req, res) {
  const userId = req.params.id;

  con.query("SELECT * FROM users WHERE id = ?", [userId], function (err, result) {
    if (err) throw err;
    if (result.length === 0) {
      return res.status(404).send('Error: User not found');
    }
    res.json({ is_admin: Number(result[0].is_admin) === 1 });
  });
});

app.delete('/users/:id', adminMiddleware, function (req, res) {
  var userId = req.params.id;

  con.query("DELETE FROM users WHERE id = ?", [userId], function (err, result) {
    if (err) throw err;
    if (result.affectedRows > 0) {
      res.send('User deleted!');
    } else {
      res.status(404).send('Error: User not found');
    }
  });
});

app.put('/users/:id/admin', adminMiddleware, function (req, res) {
  var userId = req.params.id;
  var is_admin = req.body.is_admin;

  if (is_admin === undefined) {
    res.status(400).send('Error: is_admin field is required');
  } else {
    con.query("UPDATE users SET is_admin = ? WHERE id = ?", [is_admin, userId], function (err, result) {
      if (err) throw err;
      if (result.affectedRows > 0) {
        res.send('User admin status updated!');
      } else {
        res.status(404).send('Error: User not found');
      }
    });
  }
});

app.post('/login', function (req, res) {
  var username = req.body.username;
  var password = req.body.password;

  con.query("SELECT * FROM users WHERE username = ?", [username], async function (err, result) {
    if (err) throw err;
    if (result.length > 0) {
      if (await bcrypt.compare(password, result[0].password)) {
        var token = jwt.sign({ id: result[0].id, is_admin: result[0].is_admin }, 'A7BSWN', {
          expiresIn: 86400
        });
        res.status(200).send({ auth: true, token: token, id: result[0].id, username: result[0].username });
      } else {
        res.status(401).send({ auth: false, token: null, message: 'Invalid username or password' });
      }
    } else {
      res.status(401).send({ auth: false, token: null, message: 'Invalid username or password' });
    }
  });
});

app.get('/dashboard', function (req, res) {
  var bearerHeader = req.headers['authorization'];
  if (!bearerHeader) {
    res.status(401).send('Error: Token is required');
  } else {
    var bearer = bearerHeader.split(' ');
    var token = bearer[1];
    jwt.verify(token, 'A7BSWN', function (err, decoded) {
      if (err) {
        // Token is not valid
        res.status(401).send('Error: Invalid token :(');
      } else {
        // Token is valid, decoded object contains the user's ID
        res.send('Welcome to your dashboard!');
      }
    });
  }
});

app.post('/posts', function (req, res) {
  var title = req.body.title;
  var content = req.body.content;
  var userId = req.body.userId;

  if (!title || !content || !userId) {
    res.status(400).send('Error: Title, content and user ID are required');
  } else {
    con.query("INSERT INTO posts (title, content, user_id) VALUES (?, ?, ?)", [title, content, userId], function (err, result) {
      if (err) throw err;
      res.send('Post created!');
    });
  }
});

app.get('/posts', function (req, res) {
  con.query("SELECT posts.id, posts.title, posts.content, posts.user_id, users.username, users.is_admin FROM posts join users on users.id = posts.user_id", function (err, result) {
    if (err) throw err;
    res.json(result);
  });
});

app.get('/posts/:id', function (req, res) {
  con.query("SELECT * FROM posts WHERE id = ?", [req.params.id], function (err, result) {
    if (err) throw err;
    if (result.length > 0) {
      res.json(result[0]);
    } else {
      res.status(404).send('Error: Post not found');
    }
  });
});

app.put('/posts/:id', function (req, res) {
  var title = req.body.title;
  var content = req.body.content;
  var userId = req.body.userId;

  if (!title || !content || !userId) {
    res.status(400).send('Error: Title, content and user ID are required');
  } else {
    con.query("UPDATE posts SET title = ?, content = ?, user_id = ? WHERE id = ?", [title, content, userId, req.params.id], function (err, result) {
      if (err) throw err;
      if (result.affectedRows > 0) {
        res.send('Post updated!');
      } else {
        res.status(404).send('Error: Post not found');
      }
    });
  }
});

app.delete('/posts/:id', function (req, res) {
  // Get the user's ID from the headers
  const userId = req.headers['x-user-id'];

  // First, fetch the post
  con.query('SELECT * FROM posts WHERE id = ?', [req.params.id], function (err, results) {
    if (err) throw err;
    if (results.length === 0) {
      return res.status(404).send('Error: Post not found');
    }

    const post = results[0];

    con.query("SELECT is_admin FROM users WHERE id = ?", [userId], function (err, result) {
      if (err) throw err;
      if (result.length === 0) {
        return res.status(404).send('Error: User not found');
      }
      if (post.user_id != userId && result[0].is_admin != 1) {
        return res.status(403).send('Error: You are not authorized to delete this post');
      }
      con.query('DELETE FROM posts WHERE id = ?', [req.params.id], function (err, result) {
        if (err) throw err;
        res.send('Post deleted!');
      });
    });
  });
});


app.listen(8080, function () {
  console.log('Server is running on port 8080');
});