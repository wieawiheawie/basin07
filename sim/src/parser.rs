use crate::lexer::{lex, Token, TokenKind};

#[derive(Debug, Clone, Default)]
pub struct Glossary {
    entries: Vec<(String, String)>,
}

impl Glossary {
    pub fn set(&mut self, action_id: &str, display_word: &str) {
        if let Some((_, word)) = self.entries.iter_mut().find(|(id, _)| id == action_id) {
            *word = display_word.to_owned();
        } else {
            self.entries.push((action_id.to_owned(), display_word.to_owned()));
        }
    }

    pub fn id_for(&self, display_word: &str) -> Option<&str> {
        self.entries
            .iter()
            .find(|(_, word)| word.eq_ignore_ascii_case(display_word))
            .map(|(id, _)| id.as_str())
    }

    pub fn closest_action_word<'a>(&'a self, input: &str) -> Option<&'a str> {
        self.entries
            .iter()
            .filter(|(id, _)| id.starts_with("action."))
            .min_by_key(|(_, word)| edit_distance(input, word))
            .map(|(_, word)| word.as_str())
    }

    pub fn word_for<'a>(&'a self, action_id: &'a str) -> &'a str {
        self.entries
            .iter()
            .find(|(id, _)| id == action_id)
            .map(|(_, word)| word.as_str())
            .unwrap_or(action_id)
    }
}

fn edit_distance(left: &str, right: &str) -> usize {
    let right_chars: Vec<char> = right.chars().collect();
    let mut previous: Vec<usize> = (0..=right_chars.len()).collect();
    let mut current = vec![0; right_chars.len() + 1];
    for (row, left_char) in left.chars().enumerate() {
        current[0] = row + 1;
        for (column, right_char) in right_chars.iter().enumerate() {
            let substitution = previous[column] + usize::from(left_char != *right_char);
            current[column + 1] = (previous[column + 1] + 1)
                .min(current[column] + 1)
                .min(substitution);
        }
        std::mem::swap(&mut previous, &mut current);
    }
    previous[right_chars.len()]
}

#[derive(Debug, Clone, PartialEq)]
pub enum Direction {
    North,
    East,
    South,
    West,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PositionExpr {
    Coordinate(f32, f32),
    Object(String),
    Direction(Direction),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Command {
    Carve {
        from: PositionExpr,
        to: PositionExpr,
        depth: f32,
        width: f32,
    },
    Uncap(String),
    Tap(String),
    Tip {
        object: String,
        toward: Option<PositionExpr>,
    },
    Upright(String),
    Look(String),
    Paint { object: String, colour: u8 },
    RollEast(String),
    ShiftDown,
    Help,
    List,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Condition {
    GardenMoistureBelow(f32),
}

#[derive(Debug, Clone, PartialEq)]
pub enum PipeStep {
    RollEast,
    Paint(u8),
}

#[derive(Debug, Clone, PartialEq)]
pub enum Statement {
    RawCommand(String),
    Repeat { count: u8, body: Vec<Statement> },
    If { condition: Condition, body: Vec<Statement> },
    When { condition: Condition, body: Vec<Statement> },
    Let { name: String, value: String },
    Pipe { object: String, steps: Vec<PipeStep> },
}

pub fn parse(source: &str, glossary: &Glossary) -> Result<Command, String> {
    let tokens = lex(source)?;
    let mut parser = Parser {
        tokens,
        cursor: 0,
        glossary,
    };
    parser.command()
}

pub fn parse_program(source: &str, glossary: &Glossary) -> Result<Vec<Statement>, String> {
    let tokens = lex(source)?;
    if tokens.is_empty() {
        return Err("Write a command or script first.".to_owned());
    }
    let mut parser = ScriptParser { source, tokens, cursor: 0 };
    let statements = parser.block(false)?;
    if !parser.at_end() {
        return Err("There is an unmatched closing brace in the script.".to_owned());
    }
    Ok(statements)
}

pub fn colour_index(name: &str) -> Option<u8> {
    match name.to_ascii_lowercase().as_str() {
        "red" => Some(1),
        "blue" => Some(2),
        "green" => Some(3),
        "yellow" => Some(4),
        "brown" => Some(5),
        "purple" => Some(6),
        "white" => Some(7),
        "black" => Some(8),
        _ => None,
    }
}

struct Parser<'a> {
    tokens: Vec<Token>,
    cursor: usize,
    glossary: &'a Glossary,
}

impl Parser<'_> {
    fn command(&mut self) -> Result<Command, String> {
        let action_word = self.word("Start with a command word.")?;
        let action_id = self
            .glossary
            .id_for(&action_word)
            .ok_or_else(|| {
                let suggestion = self.glossary.closest_action_word(&action_word).unwrap_or("help");
                format!("I don't recognise '{action_word}'. Did you mean '{suggestion}'?")
            })?
            .to_owned();

        let command = match action_id.as_str() {
            "action.carve" => self.carve()?,
            "action.uncap" => Command::Uncap(self.word("Tell me which object to uncap.")?),
            "action.tap" => Command::Tap(self.word("Tell me which barrel to tap.")?),
            "action.tip" => self.tip()?,
            "action.upright" => Command::Upright(self.word("Tell me which object to stand upright.")?),
            "action.look" => Command::Look(self.word("Tell me what you want to look at.")?),
            "action.paint" => self.paint()?,
            "action.set_colour" => self.set_colour()?,
            "action.roll_east" => Command::RollEast(self.word("Tell me which pencil to roll.")?),
            "action.shift_down" => Command::ShiftDown,
            "action.help" => Command::Help,
            "action.list" => Command::List,
            _ => return Err(format!("'{action_word}' is not an action in this glossary.")),
        };

        if !self.at_end() {
            return Err("There is extra text after that command. Remove it and try again.".to_owned());
        }
        Ok(command)
    }

    fn carve(&mut self) -> Result<Command, String> {
        self.expect_keyword("syntax.from")?;
        let from = self.position()?;
        self.expect_keyword("syntax.to")?;
        let to = self.position()?;
        let mut depth = 0.16;
        let mut width = 0.34;

        while !self.at_end() {
            let option = self.word("I expected a depth or width option.")?;
            match self.glossary.id_for(&option) {
                Some("option.depth") => depth = self.number("Give depth a number.")?,
                Some("option.width") => width = self.number("Give width a number.")?,
                _ => return Err(format!("I don't know the carve option '{option}'. Check the help panel.")),
            }
        }

        if !(0.01..=1.2).contains(&depth) {
            return Err("Depth must be between 0.01 and 1.2.".to_owned());
        }
        if !(0.06..=2.0).contains(&width) {
            return Err("Width must be between 0.06 and 2.0.".to_owned());
        }

        Ok(Command::Carve { from, to, depth, width })
    }

    fn tip(&mut self) -> Result<Command, String> {
        let object = self.word("Tell me which object to tip.")?;
        let toward = if self.peek_keyword("syntax.toward") {
            self.expect_keyword("syntax.toward")?;
            Some(self.position()?)
        } else {
            None
        };
        Ok(Command::Tip { object, toward })
    }

    fn paint(&mut self) -> Result<Command, String> {
        let object = self.word("Tell me which object to paint.")?;
        let colour = self.word("Choose a colour such as red, blue or green.")?;
        let index = colour_index(&colour)
            .ok_or_else(|| format!("'{colour}' is not in the paint palette."))?;
        Ok(Command::Paint { object, colour: index })
    }

    fn set_colour(&mut self) -> Result<Command, String> {
        let object = self.word("Tell me which object to recolour.")?;
        self.expect_keyword("syntax.colour")?;
        self.expect_keyword("syntax.to")?;
        let colour = self.word("Choose a colour such as red, blue or green.")?;
        let index = colour_index(&colour)
            .ok_or_else(|| format!("'{colour}' is not in the paint palette."))?;
        Ok(Command::Paint { object, colour: index })
    }

    fn position(&mut self) -> Result<PositionExpr, String> {
        if self.take_kind(TokenKind::LeftParen) {
            let x = self.number("A coordinate needs an x number.")?;
            self.expect_kind(TokenKind::Comma, "Separate the two coordinates with a comma.")?;
            let z = self.number("A coordinate needs a second number.")?;
            self.expect_kind(TokenKind::RightParen, "Close the coordinate with a parenthesis.")?;
            if !(0.0..=10.0).contains(&x) || !(0.0..=10.0).contains(&z) {
                return Err("Desk coordinates must be between 0 and 10.".to_owned());
            }
            return Ok(PositionExpr::Coordinate(x, z));
        }

        let word = self.word("Use a coordinate or an object name for this position.")?;
        let direction = match self.glossary.id_for(&word) {
            Some("direction.north") => Some(Direction::North),
            Some("direction.east") => Some(Direction::East),
            Some("direction.south") => Some(Direction::South),
            Some("direction.west") => Some(Direction::West),
            _ => None,
        };
        if let Some(direction) = direction {
            Ok(PositionExpr::Direction(direction))
        } else {
            Ok(PositionExpr::Object(word))
        }
    }

    fn expect_keyword(&mut self, action_id: &str) -> Result<(), String> {
        let word = self.word("A required word is missing.")?;
        if self.glossary.id_for(&word) == Some(action_id) {
            Ok(())
        } else {
            Err(format!("I expected '{}' here.", self.glossary.word_for(action_id)))
        }
    }

    fn peek_keyword(&self, action_id: &str) -> bool {
        match self.tokens.get(self.cursor).map(|token| &token.kind) {
            Some(TokenKind::Word(word)) => self.glossary.id_for(word) == Some(action_id),
            _ => false,
        }
    }

    fn word(&mut self, message: &str) -> Result<String, String> {
        match self.tokens.get(self.cursor).map(|token| token.kind.clone()) {
            Some(TokenKind::Word(word) | TokenKind::QuotedString(word)) => {
                self.cursor += 1;
                Ok(word)
            }
            _ => Err(message.to_owned()),
        }
    }

    fn number(&mut self, message: &str) -> Result<f32, String> {
        match self.tokens.get(self.cursor).map(|token| token.kind.clone()) {
            Some(TokenKind::Number(value)) => {
                self.cursor += 1;
                Ok(value)
            }
            _ => Err(message.to_owned()),
        }
    }

    fn take_kind(&mut self, kind: TokenKind) -> bool {
        if self.tokens.get(self.cursor).is_some_and(|token| token.kind == kind) {
            self.cursor += 1;
            true
        } else {
            false
        }
    }

    fn expect_kind(&mut self, kind: TokenKind, message: &str) -> Result<(), String> {
        if self.take_kind(kind) {
            Ok(())
        } else {
            Err(message.to_owned())
        }
    }

    fn at_end(&self) -> bool {
        self.cursor >= self.tokens.len()
    }
}

struct ScriptParser<'a> {
    source: &'a str,
    tokens: Vec<Token>,
    cursor: usize,
}

impl ScriptParser<'_> {
    fn block(&mut self, nested: bool) -> Result<Vec<Statement>, String> {
        let mut statements = Vec::new();
        loop {
            while self.take_kind(TokenKind::Semicolon) {}
            if self.at_end() {
                if nested {
                    return Err("A script block is missing its closing brace.".to_owned());
                }
                break;
            }
            if self.peek_kind(&TokenKind::RightBrace) {
                if !nested {
                    return Err("There is an unmatched closing brace in the script.".to_owned());
                }
                self.cursor += 1;
                break;
            }

            statements.push(self.statement()?);
            if self.take_kind(TokenKind::Semicolon) {
                continue;
            }
            if self.peek_kind(&TokenKind::RightBrace) || self.at_end() {
                continue;
            }
            return Err("Separate statements with ';' or put them on separate lines.".to_owned());
        }
        Ok(statements)
    }

    fn statement(&mut self) -> Result<Statement, String> {
        if self.peek_word("repeat") {
            self.cursor += 1;
            let count = self.take_number("repeat needs a whole-number count.")?;
            if count.fract() != 0.0 || !(1.0..=50.0).contains(&count) {
                return Err("repeat count must be a whole number from 1 to 50.".to_owned());
            }
            self.expect_kind(TokenKind::LeftBrace, "Open a repeat block with '{'.")?;
            let body = self.block(true)?;
            if body.is_empty() {
                return Err("A repeat block cannot be empty.".to_owned());
            }
            return Ok(Statement::Repeat { count: count as u8, body });
        }

        if self.peek_word("if") || self.peek_word("when") {
            let persistent = self.peek_word("when");
            self.cursor += 1;
            let condition = self.condition()?;
            self.expect_kind(TokenKind::LeftBrace, "Open the condition block with '{'.")?;
            let body = self.block(true)?;
            if body.is_empty() {
                return Err("A condition block cannot be empty.".to_owned());
            }
            return Ok(if persistent {
                Statement::When { condition, body }
            } else {
                Statement::If { condition, body }
            });
        }

        if self.peek_word("let") {
            self.cursor += 1;
            let name = self.take_word("Give the temporary alias a name.")?;
            self.expect_kind(TokenKind::Equals, "Use '=' between the alias name and its value.")?;
            let Some(first) = self.tokens.get(self.cursor) else {
                return Err("Give the alias a value after '='.".to_owned());
            };
            let start = first.offset;
            let end_cursor = self.find_statement_end(self.cursor);
            if end_cursor == self.cursor {
                return Err("Give the alias a value after '='.".to_owned());
            }
            let end = if let Some(token) = self.tokens.get(end_cursor) {
                token.offset
            } else {
                self.source.len()
            };
            let value = self.source[start..end].trim().to_owned();
            self.cursor = end_cursor;
            if value.is_empty() {
                return Err("Give the alias a value after '='.".to_owned());
            }
            return Ok(Statement::Let { name, value });
        }

        if self.looks_like_pipe() {
            return self.pipe();
        }

        let start_token = self.tokens.get(self.cursor).ok_or_else(|| "Expected a command.".to_owned())?;
        let start = start_token.offset;
        let end_cursor = self.find_statement_end(self.cursor);
        if end_cursor == self.cursor {
            return Err("Expected a command.".to_owned());
        }
        let end = if let Some(token) = self.tokens.get(end_cursor) {
            token.offset
        } else {
            self.source.len()
        };
        let source = self.source[start..end].trim().to_owned();
        self.cursor = end_cursor;
        Ok(Statement::RawCommand(source))
    }

    fn condition(&mut self) -> Result<Condition, String> {
        let subject = self.take_word("Expected a condition such as garden.moisture < 20%.")?;
        if !subject.eq_ignore_ascii_case("garden") {
            return Err("Only garden.moisture conditions are available in this build.".to_owned());
        }
        self.expect_kind(TokenKind::Dot, "Use garden.moisture for the soil moisture condition.")?;
        let property = self.take_word("Expected the moisture property.")?;
        if !property.eq_ignore_ascii_case("moisture") {
            return Err("The only garden condition currently supported is garden.moisture.".to_owned());
        }
        self.expect_kind(TokenKind::LessThan, "Use '<' to compare garden moisture.")?;
        let percent = self.take_number("Give the moisture threshold as a percentage.")?;
        self.expect_kind(TokenKind::Percent, "Write the moisture threshold with a '%' sign.")?;
        if !(0.0..=100.0).contains(&percent) {
            return Err("Moisture percentage must be between 0 and 100.".to_owned());
        }
        Ok(Condition::GardenMoistureBelow(percent))
    }

    fn pipe(&mut self) -> Result<Statement, String> {
        let object = self.take_word("Start a pipe with an object name.")?;
        let mut steps = Vec::new();
        while self.take_kind(TokenKind::Arrow) {
            let step = self.take_word("Expected a pipe action after '->'.")?;
            match step.as_str() {
                "roll_east" => steps.push(PipeStep::RollEast),
                "paint" => {
                    let colour = self.take_word("Write a colour after 'paint'.")?;
                    let index = colour_index(&colour)
                        .ok_or_else(|| format!("'{colour}' is not in the paint palette."))?;
                    steps.push(PipeStep::Paint(index));
                }
                _ => return Err(format!("I don't recognise the pipe action '{step}'.")),
            }
        }
        if steps.is_empty() {
            return Err("A pipe needs at least one action after '->'.".to_owned());
        }
        if !self.at_end() && !self.peek_kind(&TokenKind::Semicolon) && !self.peek_kind(&TokenKind::RightBrace) {
            return Err("There is extra text after that pipe.".to_owned());
        }
        Ok(Statement::Pipe { object, steps })
    }

    fn find_statement_end(&self, start: usize) -> usize {
        let mut parens = 0_i32;
        let mut index = start;
        while let Some(token) = self.tokens.get(index) {
            match token.kind {
                TokenKind::LeftParen => parens += 1,
                TokenKind::RightParen => parens = (parens - 1).max(0),
                TokenKind::Semicolon | TokenKind::RightBrace if parens == 0 => return index,
                _ => {}
            }
            index += 1;
        }
        index
    }

    fn looks_like_pipe(&self) -> bool {
        matches!(self.tokens.get(self.cursor).map(|token| &token.kind), Some(TokenKind::Word(_)))
            && matches!(self.tokens.get(self.cursor + 1).map(|token| &token.kind), Some(TokenKind::Arrow))
    }

    fn peek_word(&self, expected: &str) -> bool {
        matches!(self.tokens.get(self.cursor).map(|token| &token.kind),
            Some(TokenKind::Word(word)) if word.eq_ignore_ascii_case(expected))
    }

    fn peek_kind(&self, expected: &TokenKind) -> bool {
        self.tokens.get(self.cursor).is_some_and(|token| &token.kind == expected)
    }

    fn take_kind(&mut self, kind: TokenKind) -> bool {
        if self.peek_kind(&kind) {
            self.cursor += 1;
            true
        } else {
            false
        }
    }

    fn expect_kind(&mut self, kind: TokenKind, message: &str) -> Result<(), String> {
        if self.take_kind(kind) { Ok(()) } else { Err(message.to_owned()) }
    }

    fn take_word(&mut self, message: &str) -> Result<String, String> {
        match self.tokens.get(self.cursor).map(|token| token.kind.clone()) {
            Some(TokenKind::Word(word) | TokenKind::QuotedString(word)) => {
                self.cursor += 1;
                Ok(word)
            }
            _ => Err(message.to_owned()),
        }
    }

    fn take_number(&mut self, message: &str) -> Result<f32, String> {
        match self.tokens.get(self.cursor).map(|token| token.kind.clone()) {
            Some(TokenKind::Number(value)) => { self.cursor += 1; Ok(value) }
            _ => Err(message.to_owned()),
        }
    }

    fn at_end(&self) -> bool {
        self.cursor >= self.tokens.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn glossary() -> Glossary {
        let mut glossary = Glossary::default();
        for (id, word) in [
            ("action.carve", "carve"),
            ("action.uncap", "uncap"),
            ("action.tip", "tip"),
            ("action.upright", "upright"),
            ("action.look", "look"),
            ("action.help", "help"),
            ("action.tap", "tap"),
            ("action.list", "list"),
            ("action.paint", "paint"),
            ("action.set_colour", "set"),
            ("action.roll_east", "roll_east"),
            ("action.shift_down", "shift_down"),
            ("syntax.from", "from"),
            ("syntax.to", "to"),
            ("syntax.toward", "toward"),
            ("syntax.colour", "colour"),
            ("option.depth", "depth"),
            ("option.width", "width"),
            ("direction.north", "north"),
            ("direction.east", "east"),
            ("direction.south", "south"),
            ("direction.west", "west"),
        ] {
            glossary.set(id, word);
        }
        glossary
    }

    #[test]
    fn parses_carve_coordinates_and_options() {
        let command = parse("carve from (2,3) to (8,3) depth 0.2 width 0.5", &glossary()).unwrap();
        assert_eq!(
            command,
            Command::Carve {
                from: PositionExpr::Coordinate(2.0, 3.0),
                to: PositionExpr::Coordinate(8.0, 3.0),
                depth: 0.2,
                width: 0.5,
            }
        );
    }

    #[test]
    fn parser_uses_remapped_glossary_words() {
        let mut words = glossary();
        words.set("action.list", "gather");
        assert_eq!(parse("gather", &words).unwrap(), Command::List);
        assert!(parse("list", &words).is_err());
    }

    #[test]
    fn parses_object_positions_and_tip_direction() {
        assert_eq!(
            parse("tip bottle_1 toward west", &glossary()).unwrap(),
            Command::Tip {
                object: "bottle_1".to_owned(),
                toward: Some(PositionExpr::Direction(Direction::West)),
            }
        );
        assert_eq!(
            parse("carve from bottle_1 to book_2", &glossary()).unwrap(),
            Command::Carve {
                from: PositionExpr::Object("bottle_1".to_owned()),
                to: PositionExpr::Object("book_2".to_owned()),
                depth: 0.16,
                width: 0.34,
            }
        );
    }

    #[test]
    fn rejects_missing_keywords_and_out_of_range_coordinates() {
        assert!(parse("carve (2,3) to (8,3)", &glossary()).is_err());
        assert!(parse("carve from (12,3) to (8,3)", &glossary()).is_err());
    }

    #[test]
    fn unknown_commands_suggest_the_closest_real_action() {
        let error = parse("chnage", &glossary()).unwrap_err();
        assert!(error.contains("Did you mean"));
    }

    #[test]
    fn parses_tap_and_help_commands() {
        assert_eq!(parse("tap barrel_1", &glossary()).unwrap(), Command::Tap("barrel_1".to_owned()));
        assert_eq!(parse("help", &glossary()).unwrap(), Command::Help);
    }

    #[test]
    fn parses_chained_commands_and_repeat_blocks() {
        let program = parse_program(
            "uncap bottle_1 ; tip bottle_1 toward (10,10) ; repeat 5 { shift_down ; paint pencil_1 red }",
            &glossary()
        ).unwrap();
        assert_eq!(program.len(), 3);
        assert!(matches!(program[0], Statement::RawCommand(_)));
        assert!(matches!(program[2], Statement::Repeat { count: 5, .. }));
    }

    #[test]
    fn parses_if_when_and_let_statements() {
        let program = parse_program(
            "let trench = (1,2) to (7,2) ; if garden.moisture < 20% { tip bottle_1 } ; when garden.moisture < 30% { upright bottle_1 }",
            &glossary()
        ).unwrap();
        assert!(matches!(program[0], Statement::Let { .. }));
        assert!(matches!(program[1], Statement::If { .. }));
        assert!(matches!(program[2], Statement::When { .. }));
    }

    #[test]
    fn parses_functional_pipes_and_paint() {
        let program = parse_program("pencil_1 -> roll_east -> paint red ; paint pencil_2 'blue'", &glossary()).unwrap();
        assert!(matches!(program[0], Statement::Pipe { .. }));
        assert_eq!(parse("paint pencil_1 red", &glossary()).unwrap(), Command::Paint { object: "pencil_1".to_owned(), colour: 1 });
        assert_eq!(parse("set pencil_1 colour to 'red'", &glossary()).unwrap(), Command::Paint { object: "pencil_1".to_owned(), colour: 1 });
    }
}